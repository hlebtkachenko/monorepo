// Held-write edit replay — a FAITHFUL, per-tool replication of the real reviewer-edit merge
// `applyHeldWriteEdit` (`apps/web/app/_components/held-writes/edit-model.ts`), the single function
// that actually folds an M1.7 edit-before-approve diff back onto the ORIGINAL `input_json` before it
// replays through the domain call on approve.
//
// SINGLE SOURCE OF TRUTH: `edit-model.ts` is authoritative. This is a byte-for-byte re-statement of
// its per-tool semantics, kept here because the librarian (`packages/brain`) CANNOT import it: that
// module transitively pulls `@workspace/accounting` (via `view-model.ts`'s `vatGroupLabel`/preview),
// and this package's hard boundary is "the Brain never imports @workspace/accounting" (see
// packages/brain/CLAUDE.md). Importing `apps/web` from a package would also invert the dependency
// direction. So the exact merge — including the `vatGroupLabel` grouping — is replicated verbatim.
// If `edit-model.ts` changes, THIS file must change in lockstep (there is no shared runtime home for
// the merge yet; promoting it to one is future work).
//
// Why it matters here: the librarian votes/distills on the human's FINAL decision. That decision has
// to be exactly the treatment that would BOOK, or a distilled rule is voted on a payload that never
// actually books. The prior shallow spread (`{...input, ...edit.header, vatAmounts, postingLines}`)
// diverged from the real replay on every tool — it renamed nothing (`header.date` → `occurredAt` /
// `issuedAt` / `entry.postingDate`), folded VAT into a non-existent top-level `vatAmounts` instead of
// `lines[].partials[]`, and attached posting lines to tools that ignore them. This restores fidelity.

import type { CorrectionEdit } from "./correction"

/** Matches `edit-model.ts`'s `isRecord` EXACTLY: arrays count as records (it does not exclude them).
 * Replicated as-is so the group/merge branches take the same paths on the same inputs. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

/** The only header field the review view-model surfaces (`occurredAt` / `issuedAt` / posting date). */
function headerDate(edit: CorrectionEdit): string | undefined {
  const date = edit.header?.date
  return typeof date === "string" ? date : undefined
}

// Verbatim from `view-model.ts` — `vatGroupLabel` is the grouping key `applyDocumentEdit` folds an
// edited VAT amount back onto. Duplicated (not imported) to keep the accounting-free boundary.
const VAT_MODE_LABELS: Record<string, string> = {
  STANDARD: "základní režim",
  REVERSE_CHARGE: "přenesená daňová povinnost",
  EXEMPT: "osvobozeno",
  OUTSIDE_VAT: "mimo předmět DPH",
  IMPORT: "dovoz",
}

function vatGroupLabel(rate: string | null, mode: string): string {
  return rate ? `${rate} %` : (VAT_MODE_LABELS[mode] ?? mode)
}

/** `createAccountingEvent` — only the header date is editable (→ `occurredAt`); nothing else. */
function applyEventEdit(
  input: Record<string, unknown>,
  edit: CorrectionEdit,
): Record<string, unknown> {
  const date = headerDate(edit)
  if (!date) return input
  return { ...input, occurredAt: date }
}

/**
 * `captureAccountingDocument` — header date (→ `issuedAt`) + per-rate VAT amounts folded back onto
 * the ORIGINAL nested `lines[].partials[]`, grouped by the SAME `vatGroupLabel` key the view-model
 * rolls them up by. A group is only rewritten when it holds exactly ONE partial (unambiguous) AND an
 * edit targets its label; everything else on each partial is preserved untouched. Byte-for-byte
 * `applyDocumentEdit`.
 */
function applyDocumentEdit(
  input: Record<string, unknown>,
  edit: CorrectionEdit,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input }
  const date = headerDate(edit)
  if (date) next["issuedAt"] = date

  const vatAmounts = edit.vatAmounts ?? []
  // Read the typed {rateLabel, base, vat} triple the real HeldWriteEdit carries; skip any entry
  // whose fields aren't the decimal strings the real schema guarantees.
  const editByLabel = new Map<string, { base: string; vat: string }>()
  for (const raw of vatAmounts) {
    const rateLabel = raw["rateLabel"]
    const base = raw["base"]
    const vat = raw["vat"]
    if (
      typeof rateLabel === "string" &&
      typeof base === "string" &&
      typeof vat === "string"
    ) {
      editByLabel.set(rateLabel, { base, vat })
    }
  }

  if (editByLabel.size > 0) {
    const originalLines = Array.isArray(input["lines"]) ? input["lines"] : []

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
      const change = editByLabel.get(label)
      const loc = locations[0]
      if (!change || !loc) continue
      const targetLine = nextLines[loc.line]
      if (!isRecord(targetLine)) continue
      const partials = targetLine["partials"] as unknown[]
      const original = partials[loc.partial]
      if (!isRecord(original)) continue
      partials[loc.partial] = {
        ...original,
        baseAmount: change.base,
        vatAmount: change.vat,
      }
    }
    next["lines"] = nextLines
  }

  return next
}

/**
 * `createAccountingPosting` — header date (→ `entry.postingDate`) + double-entry lines merged
 * POSITIONALLY onto `entry.lines` (index i ↔ index i), only for kind "double" (a monetary/cash
 * posting has no accountId/side lines to edit). Byte-for-byte `applyPostingEdit`.
 */
function applyPostingEdit(
  input: Record<string, unknown>,
  edit: CorrectionEdit,
): Record<string, unknown> {
  const next: Record<string, unknown> = { ...input }
  const entry = isRecord(input["entry"]) ? { ...input["entry"] } : {}

  const date = headerDate(edit)
  if (date) entry["postingDate"] = date

  const postingLines = edit.postingLines
  if (postingLines && postingLines.length > 0 && input["kind"] === "double") {
    const originalLines = Array.isArray(entry["lines"]) ? entry["lines"] : []
    entry["lines"] = originalLines.map((line, i) => {
      const change = postingLines[i]
      if (!change || !isRecord(line)) return line
      return {
        ...line,
        accountId: change.accountId,
        side: change.side,
        amount: change.amount,
      }
    })
  }

  next["entry"] = entry
  return next
}

/**
 * Apply a reviewer's edit to the ORIGINAL held-write `input_json`, dispatched by `toolName` exactly
 * like `applyHeldWriteEdit`. Returns a NEW object (never mutates `input`); an unknown tool name
 * passes `input` through unchanged (defensive — matches the real default case).
 */
export function applyCorrectionEditReplay(
  toolName: string,
  input: Record<string, unknown>,
  edit: CorrectionEdit,
): Record<string, unknown> {
  switch (toolName) {
    case "createAccountingEvent":
      return applyEventEdit(input, edit)
    case "captureAccountingDocument":
      return applyDocumentEdit(input, edit)
    case "createAccountingPosting":
      return applyPostingEdit(input, edit)
    default:
      return input
  }
}
