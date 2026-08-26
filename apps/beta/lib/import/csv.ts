/**
 * The CSV reader behind Měsíční uzávěrka's manual fallback (spec §3.2: "a
 * manual file-drop fallback (CSV mapping, simple) for when the agent is
 * unavailable").
 *
 * WHAT THIS FILE IS FOR. The office's normal feeding channel is the agent
 * (§3.2), and this path exists for the month the agent is down — which is,
 * by construction, the month nobody has time to debug an import. So the
 * requirement is not "parse CSV"; it is "parse what a Czech accountant's
 * software actually writes, and when it cannot, say which line and why".
 *
 * FOUR THINGS THAT ARE NOT OPTIONAL for that input:
 *
 *   1. A BYTE-ORDER MARK. Excel on Windows writes UTF-8 with a BOM by default,
 *      and an unstripped BOM prefixes the first header with U+FEFF, which
 *      matches nothing and produces "missing column: Účet" over a file whose
 *      first column IS Účet.
 *   2. A SEMICOLON DELIMITER. A cs-CZ locale writes `;`, because `,` is the
 *      decimal separator. A parser hardwired to `,` reads `1,50` as two fields
 *      and every row comes out ragged.
 *   3. QUOTED FIELDS, RFC 4180. Account names contain semicolons and commas
 *      ("Ostatní služby; drobné"), so quoting is not a corner case, and `""`
 *      inside a quoted field is the only way to write a literal quote.
 *   4. A CZECH DECIMAL COMMA, with space thousands separators — `1 234,50`,
 *      including the NON-BREAKING space `Intl` itself emits (U+00A0) and the
 *      narrow one (U+202F) newer ICU versions use.
 *
 * NOTHING IS EVER SILENTLY DROPPED. A row that cannot be read is an ISSUE with
 * a line number, and one issue rejects the whole file (`readDatasetCsv` in
 * `./datasets.ts`). A partial předvaha is worse than no předvaha: it publishes
 * a statement whose totals are quietly short, which is exactly the
 * confidently-wrong data §0.4 exists to prevent. There is no "skip bad rows"
 * mode and there must never be one.
 *
 * PURE MODULE — no `server-only`, no database, no i18n. Issues carry CODES, not
 * Czech sentences: the UI maps them to `BetaMessageKey`s, so the parser stays a
 * unit-testable function over a string and the Czech wording lives in the
 * catalog with every other string in the app.
 */

/** The delimiters sniffed on the header line, in preference order for a tie. */
const DELIMITERS = [";", ",", "\t"] as const

export type CsvDelimiter = (typeof DELIMITERS)[number]

/**
 * A whole-file refusal: nothing about this input can be read, so there are no
 * rows to report issues against.
 */
export type CsvStructuralCode =
  /** No bytes, or nothing but whitespace. */
  | "empty_file"
  /** A `"` opened a field and the file ended inside it. */
  | "unterminated_quote"
  /** A header line, and not one data row after it. */
  | "no_data_rows"

export type CsvRecord = {
  /** The cell values of one record, in file order, already unquoted. */
  readonly values: readonly string[]
  /** 1-based PHYSICAL line the record starts on — what the office sees in Excel. */
  readonly line: number
}

type CsvDocument = {
  readonly delimiter: CsvDelimiter
  readonly header: CsvRecord
  readonly rows: readonly CsvRecord[]
}

export type CsvReadResult =
  | { readonly ok: true; readonly document: CsvDocument }
  | { readonly ok: false; readonly code: CsvStructuralCode }

/**
 * Decide which delimiter the file uses, by counting candidates on the header
 * line OUTSIDE quotes.
 *
 * Counting inside quotes is what makes a file whose first header is
 * `"Účet;analytika"` look like a semicolon file when it is a comma file. The
 * scan therefore tracks quoting even though it only cares about one line.
 *
 * A tie (including "none of them appear", a single-column file) resolves to
 * `;`, the cs-CZ default — the arm this fallback exists to serve.
 */
export function detectDelimiter(headerLine: string): CsvDelimiter {
  const counts = new Map<CsvDelimiter, number>(DELIMITERS.map((d) => [d, 0]))
  let quoted = false

  for (let i = 0; i < headerLine.length; i += 1) {
    const char = headerLine[i]!
    if (char === '"') {
      // A doubled quote inside a quoted field is a literal — skip both so it
      // does not flip the state and unbalance the rest of the line.
      if (quoted && headerLine[i + 1] === '"') {
        i += 1
        continue
      }
      quoted = !quoted
      continue
    }
    if (quoted) continue
    const candidate = DELIMITERS.find((d) => d === char)
    if (candidate) counts.set(candidate, counts.get(candidate)! + 1)
  }

  let best: CsvDelimiter = ";"
  let bestCount = 0
  for (const delimiter of DELIMITERS) {
    const count = counts.get(delimiter)!
    if (count > bestCount) {
      best = delimiter
      bestCount = count
    }
  }
  return best
}

/** The first physical line, for delimiter sniffing. */
function firstLine(text: string): string {
  const end = text.search(/\r\n|\n|\r/)
  return end === -1 ? text : text.slice(0, end)
}

/**
 * Tokenize the whole file into records.
 *
 * ONE PASS, RFC 4180, with the line counter advanced by the tokenizer itself
 * rather than reconstructed afterwards — a newline INSIDE a quoted field is a
 * real line in the file and must move the number the office is shown, while not
 * ending the record.
 *
 * A record of exactly one empty field is a blank line and is dropped. That is
 * the only thing dropped anywhere in this module, and it is not data: trailing
 * blank lines are what every editor and every exporter leaves behind.
 */
function tokenize(
  text: string,
  delimiter: CsvDelimiter,
): { records: CsvRecord[] } | { code: "unterminated_quote" } {
  const records: CsvRecord[] = []
  let values: string[] = []
  let field = ""
  let quoted = false
  let line = 1
  let recordLine = 1

  const endField = (): void => {
    values.push(field)
    field = ""
  }
  const endRecord = (): void => {
    endField()
    const blank = values.length === 1 && values[0]!.trim() === ""
    if (!blank) records.push({ values, line: recordLine })
    values = []
    recordLine = line
  }

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i]!

    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"'
          i += 1
          continue
        }
        quoted = false
        continue
      }
      if (char === "\r") {
        // Normalize CRLF inside a quoted field to a single newline, and count
        // the physical line either way.
        if (text[i + 1] === "\n") i += 1
        field += "\n"
        line += 1
        continue
      }
      if (char === "\n") {
        field += "\n"
        line += 1
        continue
      }
      field += char
      continue
    }

    if (char === '"') {
      quoted = true
      continue
    }
    if (char === delimiter) {
      endField()
      continue
    }
    if (char === "\r" || char === "\n") {
      if (char === "\r" && text[i + 1] === "\n") i += 1
      line += 1
      endRecord()
      continue
    }
    field += char
  }

  if (quoted) return { code: "unterminated_quote" }
  // The last record, when the file does not end with a newline.
  if (field.length > 0 || values.length > 0) endRecord()

  return { records }
}

/**
 * Read raw CSV text into a header record and its data records.
 *
 * The BOM is stripped BEFORE anything else looks at the text, including the
 * delimiter sniff — see reason 1 in this module's header.
 */
export function readCsv(text: string): CsvReadResult {
  const withoutBom = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
  if (withoutBom.trim() === "") return { ok: false, code: "empty_file" }

  const delimiter = detectDelimiter(firstLine(withoutBom))
  const tokenized = tokenize(withoutBom, delimiter)
  if ("code" in tokenized) return { ok: false, code: tokenized.code }

  const [header, ...rows] = tokenized.records
  if (!header) return { ok: false, code: "empty_file" }
  if (rows.length === 0) return { ok: false, code: "no_data_rows" }

  return { ok: true, document: { delimiter, header, rows } }
}

// ---------------------------------------------------------------------------
// Header matching
// ---------------------------------------------------------------------------

/**
 * Fold a header name to the form aliases are compared in: trimmed, lowercased,
 * DIACRITICS REMOVED, and every run of non-alphanumerics collapsed to one `_`.
 *
 * Diacritics come off because the same column is written `Účet`, `ucet` and
 * `ÚČET` by three different exporters, and refusing two of the three would make
 * the office edit a file by hand at month end. NFD + combining-mark strip is the
 * whole of it — `č` decomposes to `c` + U+030C, and dropping the mark leaves
 * `c`. It is a MATCHING form only: the header as written is what gets recorded
 * in `import_batch.mapping`, so the office can see what the reader actually
 * matched against.
 */
export function normalizeHeader(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
}

/**
 * Which column index each declared field was found at, plus the header text as
 * it was actually written.
 *
 * A field with no matching header is absent from both maps — the caller decides
 * whether that is fatal (a required column) or simply a column this file does
 * not carry (§0.4: an omitted column is not a zero).
 *
 * FIRST MATCH WINS on a duplicated header. A file with two `Účet` columns is
 * malformed, but reading the first is deterministic and every other choice is a
 * coin flip.
 */
export type ColumnIndex = {
  readonly index: ReadonlyMap<string, number>
  /** field → the header text as written in the file, for `import_batch.mapping`. */
  readonly matched: Readonly<Record<string, string>>
}

export function indexColumns(
  header: CsvRecord,
  aliases: Readonly<Record<string, readonly string[]>>,
): ColumnIndex {
  const normalized = header.values.map((value) => normalizeHeader(value))
  const index = new Map<string, number>()
  const matched: Record<string, string> = {}

  for (const [field, candidates] of Object.entries(aliases)) {
    const at = normalized.findIndex((value) =>
      candidates.some((candidate) => candidate === value),
    )
    if (at === -1) continue
    index.set(field, at)
    matched[field] = header.values[at]!.trim()
  }

  return { index, matched }
}

/** The cell for `field`, trimmed. `null` when the file has no such column. */
export function cell(
  row: CsvRecord,
  columns: ColumnIndex,
  field: string,
): string | null {
  const at = columns.index.get(field)
  if (at === undefined) return null
  return (row.values[at] ?? "").trim()
}

// ---------------------------------------------------------------------------
// Value shapes
// ---------------------------------------------------------------------------

/**
 * Every space a Czech exporter uses as a thousands separator.
 *
 * Plain `\s` is enough and is the point: JavaScript's `\s` is the UNICODE
 * whitespace class, so it already covers U+00A0 (the non-breaking space
 * `Intl.NumberFormat` itself emits for cs-CZ), U+202F (the narrow one newer ICU
 * versions switched to) and U+2009 — the three that a hand-written `[ ]` would
 * miss and that a round-tripped "1 234,50" is actually made of.
 */
const SPACES = /\s/g

/** The shape `numeric(14,2)` takes, after normalization. Mirrors `formDecimal`. */
const DECIMAL = /^-?\d{1,12}(?:\.\d{1,2})?$/

/**
 * A money cell → the exact decimal STRING Postgres will store, or a refusal.
 *
 * NOTHING IS PARSED INTO A NUMBER, here or anywhere downstream (spec §0.7). The
 * normalization is textual: separators are removed and a decimal comma becomes
 * a dot. No digit moves.
 *
 * THE COMMA DECIDES WHICH SEPARATOR IS WHICH, because `1.234` is genuinely
 * ambiguous on its own — `1234` in a cs-CZ export, `1.23` rounded in an en-US
 * one. The rule:
 *
 *   - the cell contains a comma → the comma is the DECIMAL separator, and dots
 *     and spaces are thousands separators to be removed (`1.234,50` → 1234.50);
 *   - no comma → only spaces are separators, and a dot is decimal
 *     (`1 234.50` → 1234.50, `1234` → 1234).
 *
 * That reads both dialects and never reinterprets a value that was already
 * unambiguous. A second comma, letters, or more than two decimals is a
 * refusal — not a guess.
 *
 * An EMPTY cell is `null`, not zero: a předvaha may omit a column and a
 * statutory form prints blank cells, and §0.4 says an absence renders as an
 * absence.
 */
export function parseDecimalCell(
  value: string,
): { ok: true; value: string | null } | { ok: false } {
  const trimmed = value.trim()
  if (trimmed === "") return { ok: true, value: null }

  const hasComma = trimmed.includes(",")
  let normalized = trimmed.replace(SPACES, "")
  normalized = hasComma
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized
  // A leading `+` is written by some exporters on a sign-carrying column.
  if (normalized.startsWith("+")) normalized = normalized.slice(1)

  if (!DECIMAL.test(normalized)) return { ok: false }
  return { ok: true, value: normalized }
}

/** A small whole number in an inclusive range, or a refusal. Empty → `null`. */
export function parseIntegerCell(
  value: string,
  range: { min: number; max: number },
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = value.trim()
  if (trimmed === "") return { ok: true, value: null }
  if (!/^\d{1,3}$/.test(trimmed)) return { ok: false }
  const parsed = Number(trimmed)
  if (parsed < range.min || parsed > range.max) return { ok: false }
  return { ok: true, value: parsed }
}

/**
 * A boolean cell, as the four things a Czech office actually types.
 *
 * `false` for anything unrecognised — including an empty cell, which is the
 * common case. This flag drives bold rendering; getting it wrong makes a row
 * look like a subtotal, not like a wrong number, so a refusal here would cost
 * the office an import for a cosmetic column.
 */
const TRUTHY = new Set(["1", "ano", "true", "x", "y", "yes", "a"])

export function parseBooleanCell(value: string): boolean {
  return TRUTHY.has(normalizeHeader(value))
}
