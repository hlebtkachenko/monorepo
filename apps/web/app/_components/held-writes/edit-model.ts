/**
 * [M1.7] Edit-before-approve merge — the reviewer-editable subset of a held
 * write's payload (A-Z 2.6: "the reviewer edits a proposal before approving"),
 * and the pure merge that folds an edit back onto the ORIGINAL `input_json`
 * before it replays through `stripGateEnvelope` + the domain call
 * (`resolveHeldWrite`'s approve branch). Pure data shaping — no DB, no React,
 * no `server-only` — mirrors `view-model.ts` so both the client edit form and
 * the server action share ONE merge implementation and can never drift.
 *
 * Scope is deliberately bounded to exactly what the review UI already shows
 * (`view-model.ts`), never a raw-payload free-for-all:
 *  - the header date (`occurredAt` / `issuedAt` / `entry.postingDate`,
 *    depending on tool) — the only header field the view-model surfaces.
 *  - VAT amounts per rate (`baseAmount` / `vatAmount`) for a
 *    `captureAccountingDocument` — ONLY when that rate maps to exactly ONE
 *    original partial (`HeldWriteVatSummaryRow.partialCount === 1`); a
 *    rolled-up multi-partial group is left untouched (no safe way to
 *    redistribute one edited total across several source lines).
 *  - double-entry posting lines (`accountId` / `side` / `amount`) for a
 *    `createAccountingPosting` of kind "double" — positional, 1:1 with the
 *    original `entry.lines`. A monetary/cash posting has no editable lines.
 *
 * This NEVER touches the gate envelope (`confidence` / `rationale` /
 * `conversationId` / `signals` / `templateId` / `extractionMethod`) — those
 * are stripped separately, unconditionally, by `stripGateEnvelope` after this
 * merge runs. Editing does not weaken the write gate: the edited payload
 * still replays through the SAME domain call (`createEvent` / `captureDocument`
 * / `post`), which re-validates it in full (balance, period lock, regime) —
 * editing only changes what gets proposed to that call, never how it's
 * validated.
 */
import { z } from "zod"

import { vatGroupLabel } from "./view-model"

const DECIMAL_RE = /^\d{1,15}(\.\d{1,4})?$/

// The three sub-schemas below are internal building blocks of
// `HeldWriteEditSchema` (the only wire-level shape anything outside this
// module needs — `actions.ts` validates against it, `columns.tsx` /
// `edit-panel.tsx` only need the inferred `HeldWriteEdit` type).

const HeldWriteHeaderEditSchema = z.object({
  /** occurredAt (event) / issuedAt (document) / entry.postingDate (posting). */
  date: z
    .string()
    .regex(
      /^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2})?(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$/,
    )
    .optional(),
})
type HeldWriteHeaderEdit = z.infer<typeof HeldWriteHeaderEditSchema>

const HeldWriteVatAmountEditSchema = z.object({
  /** Correlates to `HeldWriteVatSummaryRow.rateLabel` — the same grouping key `vatGroupLabel` produces. */
  rateLabel: z.string().min(1).max(60),
  base: z.string().regex(DECIMAL_RE),
  vat: z.string().regex(DECIMAL_RE),
})
type HeldWriteVatAmountEdit = z.infer<typeof HeldWriteVatAmountEditSchema>

const HeldWritePostingLineEditSchema = z.object({
  accountId: z.uuid(),
  side: z.enum(["DEBIT", "CREDIT"]),
  amount: z.string().regex(DECIMAL_RE),
})
type HeldWritePostingLineEdit = z.infer<typeof HeldWritePostingLineEditSchema>

export const HeldWriteEditSchema = z.object({
  header: HeldWriteHeaderEditSchema.optional(),
  vatAmounts: z.array(HeldWriteVatAmountEditSchema).max(50).optional(),
  postingLines: z.array(HeldWritePostingLineEditSchema).max(100).optional(),
})
export type HeldWriteEdit = z.infer<typeof HeldWriteEditSchema>

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function applyEventEdit(
  input: Record<string, unknown>,
  header: HeldWriteHeaderEdit | undefined,
): Record<string, unknown> {
  if (!header?.date) return input
  return { ...input, occurredAt: header.date }
}

/**
 * Merge edited per-rate VAT amounts back onto the ORIGINAL nested
 * `lines[].partials[]`. Groups the original partials by the exact same
 * `vatGroupLabel` key the view-model rolls them up by; a group is only
 * rewritten when it holds exactly one partial (unambiguous) AND an edit
 * targets its label. Everything else (currencyCode, vatRate, vatMode,
 * quantity, …) is preserved untouched on every partial.
 */
function applyDocumentEdit(
  input: Record<string, unknown>,
  header: HeldWriteHeaderEdit | undefined,
  vatAmounts: HeldWriteVatAmountEdit[] | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input }
  if (header?.date) next["issuedAt"] = header.date

  if (vatAmounts && vatAmounts.length > 0) {
    const editByLabel = new Map(vatAmounts.map((e) => [e.rateLabel, e]))
    const originalLines = Array.isArray(input["lines"]) ? input["lines"] : []

    // Locate every partial's (line, partial) position, grouped by label.
    const groups = new Map<string, Array<{ line: number; partial: number }>>()
    originalLines.forEach((line, li) => {
      if (!isRecord(line)) return
      const partials = Array.isArray(line["partials"]) ? line["partials"] : []
      partials.forEach((p, pi) => {
        if (!isRecord(p)) return
        const rate = typeof p["vatRate"] === "string" ? p["vatRate"] : null
        const mode =
          typeof p["vatMode"] === "string" ? p["vatMode"] : "STANDARD"
        const label = vatGroupLabel(rate, mode)
        const locations = groups.get(label) ?? []
        locations.push({ line: li, partial: pi })
        groups.set(label, locations)
      })
    })

    const nextLines = originalLines.map((line) =>
      isRecord(line)
        ? {
            ...line,
            partials: Array.isArray(line["partials"])
              ? [...line["partials"]]
              : [],
          }
        : line,
    )

    for (const [label, locations] of groups) {
      if (locations.length !== 1) continue // ambiguous group — never edited
      const edit = editByLabel.get(label)
      const loc = locations[0]
      if (!edit || !loc) continue
      const targetLine = nextLines[loc.line]
      if (!isRecord(targetLine)) continue
      const partials = targetLine["partials"] as unknown[]
      const original = partials[loc.partial]
      if (!isRecord(original)) continue
      partials[loc.partial] = {
        ...original,
        baseAmount: edit.base,
        vatAmount: edit.vat,
      }
    }
    next["lines"] = nextLines
  }

  return next
}

/**
 * Merge an edited header date + double-entry lines back onto `{kind, entry}`.
 * Lines are matched POSITIONALLY (index i in the edit ↔ index i in
 * `entry.lines`) — only meaningful for kind "double" (a monetary/cash
 * posting's lines have no accountId/side to edit here).
 */
function applyPostingEdit(
  input: Record<string, unknown>,
  header: HeldWriteHeaderEdit | undefined,
  postingLines: HeldWritePostingLineEdit[] | undefined,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input }
  const entry = isRecord(input["entry"]) ? { ...input["entry"] } : {}

  if (header?.date) entry["postingDate"] = header.date

  if (postingLines && postingLines.length > 0 && input["kind"] === "double") {
    const originalLines = Array.isArray(entry["lines"]) ? entry["lines"] : []
    entry["lines"] = originalLines.map((line, i) => {
      const edit = postingLines[i]
      if (!edit || !isRecord(line)) return line
      return {
        ...line,
        accountId: edit.accountId,
        side: edit.side,
        amount: edit.amount,
      }
    })
  }

  next["entry"] = entry
  return next
}

/**
 * Apply a reviewer's edit to the ORIGINAL held-write `input_json`, dispatched
 * by `toolName` exactly like `buildHeldWriteViewModel` does. Returns a NEW
 * object (never mutates `input`); unknown tool names pass `input` through
 * unchanged (defensive — matches `buildHeldWriteViewModel`'s default case).
 */
export function applyHeldWriteEdit(
  toolName: string,
  input: Record<string, unknown>,
  edit: HeldWriteEdit,
): Record<string, unknown> {
  switch (toolName) {
    case "createAccountingEvent":
      return applyEventEdit(input, edit.header)
    case "captureAccountingDocument":
      return applyDocumentEdit(input, edit.header, edit.vatAmounts)
    case "createAccountingPosting":
      return applyPostingEdit(input, edit.header, edit.postingLines)
    default:
      return input
  }
}
