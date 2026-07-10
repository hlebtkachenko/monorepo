// Ingest — turns raw `tool_call_log` rows (the held-write / resolve audit trail, I4/I10) into
// `CorrectionRecord`s the cluster/distill stages consume.
//
// Source of truth for the shape below: `packages/db/src/schema/tool_call_log.ts` (columns:
// `input_json`, `output_json`, `tool_name`, `conversation_id`, append-only) + the resolve path
// (`apps/api/src/v1/accounting/held-writes.controller.ts` `resolveHeldWrite`, merged on `main`:
// action `"approve" | "reject"`, `output_json = { resolution, note, ...result }`) + the unmerged
// M1.7 edit-before-approve flow (`apps/web/app/_components/held-writes/edit-model.ts`
// `HeldWriteEdit` — `header` / `vatAmounts` / `postingLines`), which stores the reviewer's edit as
// `output_json.edit` (a DIFF, never a second full payload) alongside the resolution — `input_json`
// itself is never mutated, so the Brain's original proposal is always recoverable.
//
// The correction signal this pipeline learns from is exactly "Brain's original `input_json` vs.
// the human's final verdict (`approved` as-is / `approved` with `edit` / `rejected`)" — there is no
// other place in the schema where a human's correction of a Brain proposal is recorded.

import { applyCorrectionEditReplay } from "./replay"
import { type CorrectionSignature, readCorrectionSignature } from "./signature"

export type CorrectionResolution = "approved" | "rejected"

export interface CorrectionPostingLineEdit {
  accountId: string
  side: "DEBIT" | "CREDIT"
  amount: string
}

/** Mirrors the unmerged M1.7 `HeldWriteEdit` shape. Locally redeclared — that type lives only in
 * `apps/web` today (not exported from any package); reconcile if/when it moves to a shared home. */
export interface CorrectionEdit {
  header?: Record<string, unknown>
  vatAmounts?: Record<string, unknown>[]
  postingLines?: CorrectionPostingLineEdit[]
}

/** The subset of a `tool_call_log` row (+ its resolve outcome) the librarian reads. Not the full
 * DB row — just the fields this pipeline needs. */
export interface RawCorrectionRow {
  id: string
  conversationId: string | null
  toolName: string
  createdAt: string
  /** `tool_call_log.input_json` — the Brain's ORIGINAL proposal, never mutated by a later edit. */
  inputJson: Record<string, unknown>
  /** `tool_call_log.output_json` after resolve. `null` = not yet resolved — no correction signal,
   * skipped by `ingestCorrections`. */
  outputJson: Record<string, unknown> | null
}

export interface CorrectionRecord {
  id: string
  conversationId: string | null
  toolName: string
  createdAt: string
  signature: CorrectionSignature
  proposedInput: Record<string, unknown>
  resolution: CorrectionResolution
  edit?: CorrectionEdit
  note?: string
  /**
   * The human's final correct decision, or `null` when none is known:
   *  - approved, no edit  → the Brain's own proposal IS the confirmed-correct decision.
   *  - approved, w/ edit  → the proposal with the human's edit applied through the SAME per-tool
   *    replay that actually books it (`deriveDecision` → `applyCorrectionEditReplay`).
   *  - rejected           → `null`. A bare reject names no replacement; it is a correction SIGNAL
   *    (the proposal was wrong) but never a source of a positive rule (never guess one).
   */
  decision: Record<string, unknown> | null
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function readPostingLineEdit(value: unknown): CorrectionPostingLineEdit | null {
  if (!isPlainObject(value)) return null
  const { accountId, side, amount } = value
  if (typeof accountId !== "string") return null
  if (side !== "DEBIT" && side !== "CREDIT") return null
  if (typeof amount !== "string") return null
  return { accountId, side, amount }
}

/** Lenient-but-typed read of `output_json.edit`. Malformed `postingLines` entries are dropped
 * individually (defensive — this is a clustering aid, never a booking path); an edit with no
 * recognizable field at all reads as `undefined` (equivalent to "no edit"). */
export function readCorrectionEdit(value: unknown): CorrectionEdit | undefined {
  if (!isPlainObject(value)) return undefined
  const edit: CorrectionEdit = {}
  if (isPlainObject(value.header)) edit.header = value.header
  if (Array.isArray(value.vatAmounts)) {
    const amounts = value.vatAmounts.filter(isPlainObject)
    if (amounts.length > 0) edit.vatAmounts = amounts
  }
  if (Array.isArray(value.postingLines)) {
    const lines = value.postingLines
      .map(readPostingLineEdit)
      .filter((line): line is CorrectionPostingLineEdit => line !== null)
    if (lines.length > 0) edit.postingLines = lines
  }
  if (!edit.header && !edit.vatAmounts && !edit.postingLines) return undefined
  return edit
}

/**
 * The human's final correct decision for a correction, or `null` when none is known (see
 * `CorrectionRecord.decision` doc). Uses the SAME per-tool replay that actually re-executes a
 * booking on approve — `applyCorrectionEditReplay` (`replay.ts`), a faithful re-statement of
 * `apps/web/app/_components/held-writes/edit-model.ts` `applyHeldWriteEdit` (which can't be imported
 * here — it transitively pulls `@workspace/accounting`, off-limits to the Brain). This is what makes
 * the treatment the librarian votes/distills on byte-for-byte the treatment that would book; a
 * shallow field-spread would diverge (wrong header key, wrong VAT nesting, posting lines attached to
 * tools that ignore them) and the librarian could vote on a payload that never books.
 */
export function deriveDecision(
  toolName: string,
  proposedInput: Record<string, unknown>,
  resolution: CorrectionResolution,
  edit?: CorrectionEdit,
): Record<string, unknown> | null {
  if (resolution === "rejected") return null
  if (!edit) return proposedInput
  return applyCorrectionEditReplay(toolName, proposedInput, edit)
}

/**
 * Ingest raw `tool_call_log` rows into `CorrectionRecord`s. Fail-closed at every step — a row is
 * SKIPPED (never coerced/guessed) when: unresolved (`outputJson === null`); the resolution isn't
 * exactly `"approved"` or `"rejected"`; or its 4-fact signature can't be read off `input_json`.
 */
export function ingestCorrections(
  rows: readonly RawCorrectionRow[],
): CorrectionRecord[] {
  const records: CorrectionRecord[] = []
  for (const row of rows) {
    if (row.outputJson === null) continue
    const resolution = row.outputJson.resolution
    if (resolution !== "approved" && resolution !== "rejected") continue
    const signature = readCorrectionSignature(row.inputJson)
    if (signature === null) continue
    const edit = readCorrectionEdit(row.outputJson.edit)
    const note = row.outputJson.note
    records.push({
      id: row.id,
      conversationId: row.conversationId,
      toolName: row.toolName,
      createdAt: row.createdAt,
      signature,
      proposedInput: row.inputJson,
      resolution,
      edit,
      note: typeof note === "string" ? note : undefined,
      decision: deriveDecision(row.toolName, row.inputJson, resolution, edit),
    })
  }
  return records
}
