import type { BetaMessageKey } from "@/i18n/messages"
import type { CsvIssueCode } from "@/lib/import/datasets"
import type { CsvStructuralCode } from "@/lib/import/csv"

/**
 * What Měsíční uzávěrka's actions report back to their forms — a SEPARATE
 * state from `ProUcetniActionState`, and the reason is the CSV fallback.
 *
 * Every other write in this app either succeeds or fails with one sentence.
 * A refused CSV has to name LINES: "line 14, column Konečný zůstatek, not a
 * number", twenty times if that is what the file is. Folding that into the
 * single-message state would mean either losing the lines (the office then
 * re-uploads blind) or building a Czech sentence inside a Server Action, where
 * next-intl's catalog does not belong.
 *
 * SO THE STATE CARRIES DATA, NOT PROSE. The action reports message KEYS and
 * numbers; the client component renders them. That keeps the parser's codes
 * (`lib/import/`) and the Czech wording (`messages/cs.json`) each in one place,
 * and makes the refusal itself assertable in a test without a translator.
 */
type CsvIssueMessage = {
  readonly line: number
  /** The header the issue is about, as the file spells it. */
  readonly column: string | null
  readonly message: BetaMessageKey
}

export type UzaverkaActionState =
  | { status: "idle" }
  | { status: "ok"; message: BetaMessageKey }
  | { status: "error"; error: BetaMessageKey }
  | {
      status: "csv_rejected"
      /** The headline: what kind of refusal this is. */
      error: BetaMessageKey
      /** Required columns the file does not have, as canonical Czech names. */
      missingColumns: readonly string[]
      issues: readonly CsvIssueMessage[]
      /** Issues beyond `CSV_ISSUE_LIMIT`, reported as a count. */
      hiddenIssues: number
    }

export const UZAVERKA_ACTION_IDLE: UzaverkaActionState = { status: "idle" }

/**
 * `startManualBatchAction`'s own return shape — `UzaverkaActionState` MINUS
 * `csv_rejected`, the CSV fallback's own multi-line refusal shape that action
 * never produces. `EntrySheet` (manual-entry plan §2.1/W0) is generic over a
 * CLOSED `idle | ok | error` state; a return type that still carried the
 * fourth arm would fail EntrySheet's own generic constraint structurally,
 * even though the action never returns it — so the type states the same
 * thing the runtime already guarantees. A dedicated idle constant travels
 * with it: `UZAVERKA_ACTION_IDLE` above is typed as the WIDER
 * `UzaverkaActionState`, which is not assignable to this narrower one.
 *
 * SHARED, since W2: the saldokonto row actions (`addPartnerSaldoRowAction` /
 * `updatePartnerSaldoRowAction` / `deletePartnerSaldoRowAction`) return this
 * same type rather than a second, structurally identical alias — they never
 * produce `csv_rejected` either, and they live in the same `uzaverka.ts` file
 * this type was built for.
 */
export type StartManualBatchState = Exclude<
  UzaverkaActionState,
  { status: "csv_rejected" }
>

export const START_MANUAL_BATCH_IDLE: StartManualBatchState = {
  status: "idle",
}

/**
 * How many row issues are listed before the rest become a count.
 *
 * A file with 300 bad rows has one cause, not 300, and a screen of identical
 * messages hides that. Twenty is enough to see the pattern (one column? every
 * row? only the last?) and short enough to read.
 */
export const CSV_ISSUE_LIMIT = 20

export const CSV_ISSUE_MESSAGE_KEY = {
  missing_value: "uzaverka.csvIssueMissingValue",
  invalid_amount: "uzaverka.csvIssueInvalidAmount",
  invalid_integer: "uzaverka.csvIssueInvalidInteger",
  unknown_section: "uzaverka.csvIssueUnknownSection",
  column_shape: "uzaverka.csvIssueColumnShape",
  duplicate_row: "uzaverka.csvIssueDuplicateRow",
  ragged_row: "uzaverka.csvIssueRaggedRow",
} as const satisfies Record<CsvIssueCode, BetaMessageKey>

export const CSV_STRUCTURAL_MESSAGE_KEY = {
  empty_file: "uzaverka.csvErrorEmptyFile",
  unterminated_quote: "uzaverka.csvErrorUnterminatedQuote",
  no_data_rows: "uzaverka.csvErrorNoDataRows",
  too_many_rows: "uzaverka.csvErrorTooManyRows",
} as const satisfies Record<CsvStructuralCode | "too_many_rows", BetaMessageKey>
