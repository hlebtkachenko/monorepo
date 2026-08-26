/**
 * The three CSV contracts of Měsíční uzávěrka's manual fallback, and the reader
 * that turns a file into the exact input `lib/data/imports.ts` already takes.
 *
 * THE FORMAT IS FIXED, NOT MAPPED — the one place this deviates from spec
 * §3.2's phrasing ("CSV mapping, simple"), and deliberately. A mapping UI is a
 * screen the office has to fill in correctly at month end, in the month the
 * agent is down; a fixed header contract is a file they either have or do not,
 * with the answer known before anything is written to the database. The
 * "mapping" survives as what it is actually for: `import_batch.mapping` records
 * WHICH header text each field was matched against, so a later question about a
 * published batch ("where did the konečný zůstatek come from?") is answerable
 * from the row itself. Header matching is diacritics- and case-insensitive with
 * aliases (`normalizeHeader`), which is what makes a fixed contract tolerable
 * across exporters.
 *
 * ONE BAD ROW REJECTS THE FILE. `readDatasetCsv` collects EVERY issue before it
 * refuses, so the office fixes the file once rather than one line per attempt —
 * but it never returns a partial row set. Spec §0.2 makes every number in this
 * product office-provided; a předvaha imported minus its unparseable rows would
 * be a number this application invented by omission.
 *
 * NOTHING IS COMPUTED. `sortOrder` is the row's position in the file (the
 * office's own printed order), `statementKind` is read from a column, and every
 * money value is the office's own digits normalized textually. There is no
 * total, no netto derivation and no cross-check — `statement_line.value_netto`
 * is stored as given, for exactly the reason its own schema comment gives.
 *
 * THE PAYLOAD IS THE DISCRIMINATED UNION `createDraftBatch` TAKES, not three
 * loose arrays. A `predvaha` batch carrying rozvaha rows is unrepresentable
 * there (see `ImportBatchInput`); building anything looser here and narrowing it
 * afterwards would put that guarantee back into a cast.
 *
 * PURE MODULE, same as `./csv.ts`: codes rather than Czech sentences, no
 * database, no i18n.
 */
import type {
  StatementLineInput,
  TrialBalanceLineInput,
} from "@/lib/data/imports"
import type { BetaStatementKind } from "@/db/schema"

import {
  cell,
  indexColumns,
  normalizeHeader,
  parseBooleanCell,
  parseDecimalCell,
  parseIntegerCell,
  readCsv,
  type ColumnIndex,
  type CsvDelimiter,
  type CsvRecord,
  type CsvStructuralCode,
} from "./csv"

/** The datasets this fallback can carry — the three with a payload table. */
export type CsvDataset = "predvaha" | "rozvaha" | "vzz"

export const CSV_DATASETS: readonly CsvDataset[] = Object.freeze([
  "predvaha",
  "rozvaha",
  "vzz",
])

export function isCsvDataset(value: string): value is CsvDataset {
  return CSV_DATASETS.some((dataset) => dataset === value)
}

type RozvahaKind = Extract<
  BetaStatementKind,
  "rozvaha_aktiva" | "rozvaha_pasiva"
>

/** What the file turned into — the payload arm of `ImportBatchInput`. */
type CsvPayload =
  | {
      readonly dataset: "rozvaha"
      readonly statementLines: readonly StatementLineInput<RozvahaKind>[]
    }
  | {
      readonly dataset: "vzz"
      readonly statementLines: readonly StatementLineInput<"vzz">[]
    }
  | {
      readonly dataset: "predvaha"
      readonly trialBalanceLines: readonly TrialBalanceLineInput[]
    }

/** What went wrong on ONE row, and where. */
export type CsvIssueCode =
  /** A required cell was blank. */
  | "missing_value"
  /** A money cell is not a `numeric(14,2)` in either Czech or plain notation. */
  | "invalid_amount"
  /** An indent cell is not a whole number in 0–8. */
  | "invalid_integer"
  /** The `část` column holds neither aktiva nor pasiva. */
  | "unknown_section"
  /**
   * A rozvaha row carries the other side's columns — aktiva with `běžné`, or
   * pasiva with brutto/korekce/netto. Refused HERE rather than left to
   * `statement_line_column_shape`, so it reads as "line 14 has a column that
   * does not exist on that form" instead of as a constraint name in a 500.
   */
  | "column_shape"
  /** Two rows claim the same identity — the unique index would refuse one. */
  | "duplicate_row"
  /** The row has more cells than the header has columns. */
  | "ragged_row"

type CsvIssue = {
  readonly line: number
  /** The header the issue is about, as written in the file. Null when row-wide. */
  readonly column: string | null
  readonly code: CsvIssueCode
}

type CsvMapping = {
  readonly dataset: CsvDataset
  readonly delimiter: CsvDelimiter
  /** field → the header text as the file spells it. */
  readonly columns: Readonly<Record<string, string>>
}

export type CsvDatasetResult =
  | {
      readonly ok: true
      readonly payload: CsvPayload
      readonly rowCount: number
      /** Recorded verbatim in `import_batch.mapping`. Office-internal. */
      readonly mapping: CsvMapping
    }
  | {
      readonly ok: false
      /** Set when the file could not be read at all; then `issues` is empty. */
      readonly structural: CsvStructuralCode | "too_many_rows" | null
      /** Required columns with no matching header, as canonical Czech names. */
      readonly missingColumns: readonly string[]
      readonly issues: readonly CsvIssue[]
    }

/**
 * The ceiling on a single fallback import.
 *
 * A plný-rozsah rozvaha is ~150 řádků and an analytical předvaha a few hundred;
 * 5 000 is an order of magnitude above the largest real file and an order of
 * magnitude below anything that would strain the single multi-row INSERT
 * `createDraftBatch` does. It exists so a mis-picked file (a year of účetní
 * deník) is refused before it becomes a transaction, not to police the office.
 */
export const CSV_MAX_ROWS = 5_000

// ---------------------------------------------------------------------------
// Column contracts
// ---------------------------------------------------------------------------

/**
 * field → accepted header spellings, already in `normalizeHeader` form.
 *
 * The alias lists are the compatibility surface with whatever the office's
 * software prints. They are deliberately generous on SPELLING and strict on
 * MEANING: `ucet` / `cislo_uctu` / `syntetika` are the same column, while
 * nothing maps `obrat_md` onto `obrat_dal` however similar the header looks.
 */
const PREDVAHA_ALIASES = {
  accountCode: ["ucet", "cislo_uctu", "kod_uctu", "syntetika", "account"],
  accountName: ["nazev", "nazev_uctu", "popis", "name", "text"],
  openingBalance: [
    "pocatecni_stav",
    "pocatecni_zustatek",
    "ps",
    "pocatek",
    "pocatecni",
  ],
  turnoverDebit: ["obrat_md", "obraty_md", "md", "ma_dati", "obrat_ma_dati"],
  turnoverCredit: ["obrat_dal", "obraty_dal", "obrat_d", "dal", "d"],
  closingBalance: [
    "konecny_zustatek",
    "konecny_stav",
    "ks",
    "zustatek",
    "konecny",
  ],
} as const satisfies Record<string, readonly string[]>

const STATEMENT_ALIASES = {
  section: ["cast", "strana", "sekce", "vykaz", "section"],
  ozn: ["ozn", "oznaceni", "polozka"],
  rowCode: ["radek", "cislo_radku", "rada", "r", "row"],
  rowLabel: ["text", "nazev", "polozka_text", "popis", "label"],
  brutto: ["brutto"],
  korekce: ["korekce"],
  netto: ["netto"],
  bezne: ["bezne", "bezne_obdobi", "bezne_ucetni_obdobi", "aktualni"],
  minule: ["minule", "minule_obdobi", "minule_ucetni_obdobi", "predchozi"],
  indent: ["uroven", "odsazeni", "indent"],
  bold: ["tucne", "bold", "souhrn"],
} as const satisfies Record<string, readonly string[]>

/** `část` cell → statement kind. Normalized before comparison. */
const SECTION_KINDS: Readonly<Record<string, RozvahaKind>> = {
  aktiva: "rozvaha_aktiva",
  a: "rozvaha_aktiva",
  rozvaha_aktiva: "rozvaha_aktiva",
  pasiva: "rozvaha_pasiva",
  p: "rozvaha_pasiva",
  rozvaha_pasiva: "rozvaha_pasiva",
}

/**
 * The required fields per dataset. Everything else a contract declares is
 * optional, because an omitted column is an absent value and not a zero (§0.4)
 * — the office's software may simply not print počáteční stav.
 */
const REQUIRED: Readonly<Record<CsvDataset, readonly string[]>> = {
  predvaha: ["accountCode", "accountName"],
  rozvaha: ["section", "rowCode", "rowLabel"],
  vzz: ["rowCode", "rowLabel"],
}

const ALIASES: Readonly<
  Record<CsvDataset, Readonly<Record<string, readonly string[]>>>
> = {
  predvaha: PREDVAHA_ALIASES,
  rozvaha: STATEMENT_ALIASES,
  vzz: STATEMENT_ALIASES,
}

/** The canonical Czech header a missing column is reported under. */
const CANONICAL_HEADER: Readonly<Record<string, string>> = {
  accountCode: "Účet",
  accountName: "Název",
  section: "Část",
  rowCode: "Řádek",
  rowLabel: "Text",
}

// ---------------------------------------------------------------------------
// The reader
// ---------------------------------------------------------------------------

type Collector = {
  readonly issues: CsvIssue[]
  add: (line: number, column: string | null, code: CsvIssueCode) => void
}

function collector(): Collector {
  const issues: CsvIssue[] = []
  return {
    issues,
    add: (line, column, code) => issues.push({ line, column, code }),
  }
}

/** The header text a column was matched by, for an issue's `column` field. */
function columnLabel(columns: ColumnIndex, field: string): string | null {
  return columns.matched[field] ?? null
}

/** A required cell: present and non-blank, or an issue. */
function requiredCell(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  issues: Collector,
): string | null {
  const value = cell(row, columns, field)
  if (value === null || value === "") {
    issues.add(row.line, columnLabel(columns, field), "missing_value")
    return null
  }
  return value
}

/** An optional cell, trimmed to `null` when the column or the value is absent. */
function optionalCell(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
): string | null {
  const value = cell(row, columns, field)
  return value === null || value === "" ? null : value
}

/** An optional money cell: absent column and blank cell are both `null`. */
function moneyCell(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
  issues: Collector,
): string | null {
  const raw = cell(row, columns, field)
  if (raw === null) return null
  const parsed = parseDecimalCell(raw)
  if (!parsed.ok) {
    issues.add(row.line, columnLabel(columns, field), "invalid_amount")
    return null
  }
  return parsed.value
}

/** The indent cell, defaulting to 0 — a malformed one is an issue, not a guess. */
function indentCell(
  row: CsvRecord,
  columns: ColumnIndex,
  issues: Collector,
): number {
  const raw = cell(row, columns, "indent")
  if (raw === null) return 0
  const parsed = parseIntegerCell(raw, { min: 0, max: 8 })
  if (!parsed.ok) {
    issues.add(row.line, columnLabel(columns, "indent"), "invalid_integer")
    return 0
  }
  return parsed.value ?? 0
}

/**
 * Read a CSV file into the dataset payload `createDraftBatch` takes.
 *
 * The order of refusals is deliberate: structure (can this be read at all?),
 * then required columns (is this the right file?), then size, then row content.
 * Each stage answers a different question the office would otherwise have to
 * work out from a wall of row errors — "this is a comma file", "this is the
 * saldokonto export, not the předvaha", "this is a whole year".
 */
export function readDatasetCsv(
  dataset: CsvDataset,
  text: string,
): CsvDatasetResult {
  const read = readCsv(text)
  if (!read.ok) {
    return { ok: false, structural: read.code, missingColumns: [], issues: [] }
  }

  const { document } = read
  const columns = indexColumns(document.header, ALIASES[dataset])

  const missingColumns = REQUIRED[dataset]
    .filter((field) => !columns.index.has(field))
    .map((field) => CANONICAL_HEADER[field] ?? field)
  if (missingColumns.length > 0) {
    return { ok: false, structural: null, missingColumns, issues: [] }
  }

  if (document.rows.length > CSV_MAX_ROWS) {
    return {
      ok: false,
      structural: "too_many_rows",
      missingColumns: [],
      issues: [],
    }
  }

  const issues = collector()
  const headerWidth = document.header.values.length
  for (const row of document.rows) {
    // MORE cells than headers means the delimiter appears unquoted inside a
    // field, and every column after it is shifted — a silently wrong import.
    // FEWER is benign (a trailing empty column the exporter omitted) and
    // `cell()` reads the missing ones as blank.
    if (row.values.length > headerWidth) {
      issues.add(row.line, null, "ragged_row")
    }
  }

  const payload: CsvPayload =
    dataset === "predvaha"
      ? {
          dataset,
          trialBalanceLines: readPredvaha(document.rows, columns, issues),
        }
      : dataset === "rozvaha"
        ? {
            dataset,
            statementLines: readStatement<RozvahaKind>(
              document.rows,
              columns,
              issues,
              (row) => {
                const section = requiredCell(row, columns, "section", issues)
                if (section === null) return null
                const kind = SECTION_KINDS[normalizeHeader(section)] ?? null
                if (kind === null) {
                  issues.add(
                    row.line,
                    columnLabel(columns, "section"),
                    "unknown_section",
                  )
                }
                return kind
              },
            ),
          }
        : {
            dataset,
            statementLines: readStatement<"vzz">(
              document.rows,
              columns,
              issues,
              () => "vzz",
            ),
          }

  if (issues.issues.length > 0) {
    return {
      ok: false,
      structural: null,
      missingColumns: [],
      issues: issues.issues,
    }
  }

  const rowCount =
    payload.dataset === "predvaha"
      ? payload.trialBalanceLines.length
      : payload.statementLines.length

  return {
    ok: true,
    payload,
    rowCount,
    mapping: {
      dataset,
      delimiter: document.delimiter,
      columns: columns.matched,
    },
  }
}

function readPredvaha(
  rows: readonly CsvRecord[],
  columns: ColumnIndex,
  issues: Collector,
): TrialBalanceLineInput[] {
  const lines: TrialBalanceLineInput[] = []
  const seen = new Set<string>()

  for (const row of rows) {
    const accountCode = requiredCell(row, columns, "accountCode", issues)
    const accountName = requiredCell(row, columns, "accountName", issues)

    const openingBalance = moneyCell(row, columns, "openingBalance", issues)
    const turnoverDebit = moneyCell(row, columns, "turnoverDebit", issues)
    const turnoverCredit = moneyCell(row, columns, "turnoverCredit", issues)
    const closingBalance = moneyCell(row, columns, "closingBalance", issues)

    if (accountCode === null || accountName === null) continue

    // `trial_balance_line_identity_unique` is (org, batch, account). Caught here
    // so a duplicated účet names its own line instead of failing the whole
    // transaction with a constraint name.
    if (seen.has(accountCode)) {
      issues.add(row.line, columnLabel(columns, "accountCode"), "duplicate_row")
      continue
    }
    seen.add(accountCode)

    lines.push({
      accountCode,
      accountName,
      openingBalance,
      turnoverDebit,
      turnoverCredit,
      closingBalance,
    })
  }

  return lines
}

function readStatement<K extends BetaStatementKind>(
  rows: readonly CsvRecord[],
  columns: ColumnIndex,
  issues: Collector,
  resolveKind: (row: CsvRecord) => K | null,
): StatementLineInput<K>[] {
  const lines: StatementLineInput<K>[] = []
  const seen = new Set<string>()

  rows.forEach((row, position) => {
    const rowCode = requiredCell(row, columns, "rowCode", issues)
    const rowLabel = requiredCell(row, columns, "rowLabel", issues)
    const statementKind = resolveKind(row)

    const brutto = moneyCell(row, columns, "brutto", issues)
    const korekce = moneyCell(row, columns, "korekce", issues)
    const netto = moneyCell(row, columns, "netto", issues)
    const bezne = moneyCell(row, columns, "bezne", issues)
    const minule = moneyCell(row, columns, "minule", issues)
    const indent = indentCell(row, columns, issues)

    if (rowCode === null || rowLabel === null || statementKind === null) return

    // `statement_line_column_shape`, stated one layer up. A row that carries the
    // wrong side's columns is a mis-shaped file, not a mis-typed number.
    const wrongShape =
      statementKind === "rozvaha_aktiva"
        ? bezne !== null
        : brutto !== null || korekce !== null || netto !== null
    if (wrongShape) {
      issues.add(row.line, null, "column_shape")
      return
    }

    // `statement_line_identity_unique` is (batch, kind, row_code).
    const identity = `${statementKind}:${rowCode}`
    if (seen.has(identity)) {
      issues.add(row.line, columnLabel(columns, "rowCode"), "duplicate_row")
      return
    }
    seen.add(identity)

    lines.push({
      statementKind,
      ozn: optionalCell(row, columns, "ozn"),
      rowCode,
      rowLabel,
      // THE FILE'S OWN ORDER IS THE PRINTED ORDER. Not read from a column and
      // not derived from `rowCode`: the office exports the form top to bottom,
      // and a řádek number is text (`001`, and one day not purely numeric), so
      // sorting by it would reorder the statement the moment an exporter used a
      // different numbering. Position is what the office actually saw.
      sortOrder: position + 1,
      indent,
      isBold: parseBooleanCell(cell(row, columns, "bold") ?? ""),
      brutto,
      korekce,
      netto,
      bezne,
      minule,
    })
  })

  return lines
}
