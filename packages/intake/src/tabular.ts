// Shared tabular → IR mapper for CSV + XLSX bank exports. Pure: a cell grid + context in, BankTransaction
// records + warnings out. Header detection + heuristic column mapping over Czech and English bank-export
// headers. Amounts parse both CZ ("1 234,56") and dot ("1234.56") formats into bigint haléř. Conservative:
// an unmapped/ambiguous column is a warning + needs_review, never a silently fabricated field.

import type { BankDirection, BankTransaction, IrSource } from "@workspace/brain"
import { buildEnvelope } from "./provenance"
import type { ParseContext, ParseResult, ParseWarning } from "./types"

export type Cell = string | number | null

type ColumnKind =
  | "date"
  | "amount"
  | "amount_debit"
  | "amount_credit"
  | "currency"
  | "variable_symbol"
  | "constant_symbol"
  | "specific_symbol"
  | "message"
  | "counterparty"
  | "counterparty_account"

/** Header aliases → column kind. Compared against a normalized (lowercased, diacritics-stripped) header. */
const HEADER_ALIASES: Record<ColumnKind, string[]> = {
  date: [
    "datum",
    "date",
    "datum zauctovani",
    "booking date",
    "datum transakce",
  ],
  amount: ["castka", "amount", "suma", "hodnota", "value"],
  amount_debit: ["vydaj", "debet", "debit", "vydaje", "ma dati"],
  amount_credit: ["prijem", "kredit", "credit", "prijmy", "dal"],
  currency: ["mena", "currency", "ccy"],
  variable_symbol: ["vs", "variabilni symbol", "variable symbol"],
  constant_symbol: ["ks", "konstantni symbol", "constant symbol"],
  specific_symbol: ["ss", "specificky symbol", "specific symbol"],
  message: [
    "zprava",
    "message",
    "popis",
    "poznamka",
    "zprava pro prijemce",
    "note",
    "description",
  ],
  counterparty: [
    "protistrana",
    "counterparty",
    "nazev protiuctu",
    "name",
    "partner",
  ],
  counterparty_account: [
    "protiucet",
    "counterparty account",
    "cislo protiuctu",
    "account",
  ],
}

function stripDiacritics(value: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "")
}

function normalizeHeader(value: string): string {
  return stripDiacritics(value.toLowerCase()).replace(/\s+/g, " ").trim()
}

function cellToString(cell: Cell): string {
  if (cell === null) return ""
  if (typeof cell === "number") return String(cell)
  return cell.trim()
}

/** Classify one header cell to a column kind, or null when it matches no alias. */
function classifyHeader(header: string): ColumnKind | null {
  const norm = normalizeHeader(header)
  if (!norm) return null
  for (const kind of Object.keys(HEADER_ALIASES) as ColumnKind[]) {
    const aliases = HEADER_ALIASES[kind]
    if (aliases.some((alias) => norm === alias || norm.includes(alias)))
      return kind
  }
  return null
}

/** Score a row by how many of its cells look like known headers; the best-scoring early row is the header. */
function detectHeaderRow(rows: Cell[][]): number {
  let bestIndex = -1
  let bestScore = 0
  const limit = Math.min(rows.length, 10)
  for (let i = 0; i < limit; i++) {
    const row = rows[i]
    if (!row) continue
    let score = 0
    for (const cell of row) {
      if (classifyHeader(cellToString(cell))) score++
    }
    if (score > bestScore) {
      bestScore = score
      bestIndex = i
    }
  }
  return bestScore >= 2 ? bestIndex : -1
}

/**
 * Arithmetic tail shared with pohoda.toMinor: a fully-normalized unsigned decimal string ("1234.56",
 * "1234", "0.5") → bigint minor units (×100). Callers do their own dialect-specific pre-normalization and
 * pass the sign separately. Returns null when the string is not a plain `\d+(.\d+)?`.
 */
export function decimalStringToMinor(
  normalized: string,
  negative = false,
): bigint | null {
  if (!/^\d+(?:\.\d+)?$/.test(normalized)) return null
  const [whole = "0", frac = ""] = normalized.split(".")
  const cents = (frac + "00").slice(0, 2)
  const minor = BigInt(whole) * 100n + BigInt(cents || "0")
  return negative ? -minor : minor
}

/** Parse a CZ- or dot-formatted amount string to signed bigint minor units (haléř). Null when unparseable. */
export function parseAmountMinor(raw: string): bigint | null {
  let text = raw.trim()
  if (!text) return null
  let negative = false
  if (/^\(.*\)$/.test(text)) {
    negative = true
    text = text.slice(1, -1)
  }
  text = text
    .replace(/[\s\u00a0]/g, "")
    .replace(/(?:czk|kc|kč|eur|usd|€|\$)/gi, "")
  if (text.startsWith("-")) {
    negative = true
    text = text.slice(1)
  } else if (text.startsWith("+")) {
    text = text.slice(1)
  }
  // Normalize the decimal separator. CZ uses "," decimal + "." thousands. When a "," is present it is the
  // decimal mark, so strip "." (thousands) and swap "," → ".". With NO "," a "." is ambiguous: a lone "."
  // is a decimal point ("12.5", "1234.56"), BUT integer-thousands groups ("1.234", "1.500.000") mean the
  // "." is a thousands separator — treating those as decimals understates by 1000×. Disambiguate by shape.
  if (text.includes(",")) {
    text = text.replace(/\./g, "").replace(",", ".")
  } else if (/^\d{1,3}(?:\.\d{3})+$/.test(text)) {
    // Integer thousands grouped by "." (e.g. "1.234" = 1 234, "1.500.000" = 1 500 000) — no fractional part.
    text = text.replace(/\./g, "")
  }
  return decimalStringToMinor(text, negative)
}

function parseNumberCell(cell: Cell): bigint | null {
  if (cell === null) return null
  if (typeof cell === "number") {
    // A non-finite cell (Infinity/NaN) or one whose scaled value overflows the safe-integer range would
    // make BigInt() throw a RangeError and abort the whole sheet — fail closed to a skipped row instead.
    if (!Number.isFinite(cell)) return null
    const scaled = Math.round(cell * 100)
    if (!Number.isSafeInteger(scaled)) return null
    return BigInt(scaled)
  }
  return parseAmountMinor(cell)
}

interface ColumnMap {
  byKind: Partial<Record<ColumnKind, number>>
}

function buildColumnMap(headerRow: Cell[]): ColumnMap {
  const byKind: Partial<Record<ColumnKind, number>> = {}
  headerRow.forEach((cell, index) => {
    const kind = classifyHeader(cellToString(cell))
    if (kind && byKind[kind] === undefined) byKind[kind] = index
  })
  return { byKind }
}

function at(row: Cell[], index: number | undefined): Cell {
  if (index === undefined) return null
  const value = row[index]
  return value === undefined ? null : value
}

function onlyDigits(value: string): string | undefined {
  const digits = value.replace(/\D/g, "")
  return digits.length > 0 ? digits : undefined
}

function isBlankRow(row: Cell[]): boolean {
  return row.every((cell) => cellToString(cell) === "")
}

/** Map a detected cell grid to BankTransaction IR. `source` distinguishes csv vs xlsx provenance. */
export function rowsToBankTransactions(
  rows: Cell[][],
  ctx: ParseContext,
  source: IrSource,
): ParseResult {
  const warnings: ParseWarning[] = []
  const records: BankTransaction[] = []

  if (rows.length === 0) {
    warnings.push({
      path: ctx.sourcePath,
      message: "empty tabular input — no rows",
    })
    return { records, warnings }
  }

  const headerIndex = detectHeaderRow(rows)
  if (headerIndex < 0) {
    warnings.push({
      path: ctx.sourcePath,
      message: "no recognizable header row — cannot map columns to bank fields",
    })
    return { records, warnings }
  }

  const headerRow = rows[headerIndex] ?? []
  const { byKind } = buildColumnMap(headerRow)

  const hasSignedAmount = byKind.amount !== undefined
  const hasSplitAmount =
    byKind.amount_credit !== undefined || byKind.amount_debit !== undefined
  const hasDate = byKind.date !== undefined
  if (!hasDate) {
    warnings.push({ path: ctx.sourcePath, message: "no date column detected" })
  }
  if (!hasSignedAmount && !hasSplitAmount) {
    warnings.push({
      path: ctx.sourcePath,
      message: "no amount column detected — cannot emit bank transactions",
    })
    return { records, warnings }
  }

  for (let r = headerIndex + 1; r < rows.length; r++) {
    const row = rows[r]
    if (!row || isBlankRow(row)) continue

    const locator = `row=${r}`
    let inferred = false

    const amountMinor = resolveAmount(row, byKind, hasSignedAmount)
    if (amountMinor === null) {
      warnings.push({
        path: `${ctx.sourcePath}#${locator}`,
        message: "unparseable amount — row skipped",
      })
      continue
    }

    const dateCell = cellToString(at(row, byKind.date))
    const bookingDate = normalizeDate(dateCell)
    if (!bookingDate) inferred = true

    const currency = cellToString(at(row, byKind.currency)) || "CZK"
    if (byKind.currency === undefined) inferred = true

    const direction: BankDirection = amountMinor < 0n ? "debit" : "credit"

    const message = cellToString(at(row, byKind.message)) || undefined
    const counterpartyName =
      cellToString(at(row, byKind.counterparty)) || undefined
    const counterpartyAccount =
      cellToString(at(row, byKind.counterparty_account)) || undefined
    const vs = onlyDigits(cellToString(at(row, byKind.variable_symbol)))
    const ks = onlyDigits(cellToString(at(row, byKind.constant_symbol)))
    const ss = onlyDigits(cellToString(at(row, byKind.specific_symbol)))

    const rawRow = headerRow.reduce<Record<string, Cell>>(
      (acc, headerCell, index) => {
        acc[cellToString(headerCell) || `col${index}`] = at(row, index)
        return acc
      },
      {},
    )

    const record: BankTransaction = {
      ...buildEnvelope({
        ctx,
        source,
        withinLocator: locator,
        rawBytes: JSON.stringify(rawRow),
        raw: rawRow,
        confidence: inferred ? 0.8 : 0.95,
        needsReview: inferred,
      }),
      record_type: "bank_transaction",
      account: {},
      booking_date: bookingDate ?? dateCell,
      amount_minor: amountMinor,
      currency,
      direction,
      ...(counterpartyName || counterpartyAccount
        ? {
            counterparty: {
              name: counterpartyName,
              account: counterpartyAccount,
            },
          }
        : {}),
      ...(vs ? { variable_symbol: vs } : {}),
      ...(ks ? { constant_symbol: ks } : {}),
      ...(ss ? { specific_symbol: ss } : {}),
      ...(message ? { message } : {}),
    }
    records.push(record)
  }

  return { records, warnings }
}

function resolveAmount(
  row: Cell[],
  byKind: Partial<Record<ColumnKind, number>>,
  hasSignedAmount: boolean,
): bigint | null {
  if (hasSignedAmount) {
    return parseNumberCell(at(row, byKind.amount))
  }
  const credit = parseNumberCell(at(row, byKind.amount_credit))
  const debit = parseNumberCell(at(row, byKind.amount_debit))
  if (credit !== null && credit !== 0n) return credit > 0n ? credit : -credit
  if (debit !== null && debit !== 0n) return debit > 0n ? -debit : debit
  return null
}

/** Normalize a date cell to ISO YYYY-MM-DD. Handles DD.MM.YYYY, D. M. YYYY, and already-ISO. Null if unclear. */
export function normalizeDate(value: string): string | null {
  const text = value.trim()
  if (!text) return null
  const iso = /^(\d{4})-(\d{2})-(\d{2})/.exec(text)
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`
  const cz = /^(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(text)
  if (cz) {
    const day = cz[1]!.padStart(2, "0")
    const month = cz[2]!.padStart(2, "0")
    return `${cz[3]}-${month}-${day}`
  }
  return null
}
