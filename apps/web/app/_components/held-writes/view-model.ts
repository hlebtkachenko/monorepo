/**
 * Held-write review view-model — shapes a raw `tool_call_log` held row (the
 * gate's `input_json` + `output_json`) into what a human reviewer needs: a
 * document header, a per-rate VAT rollup, and the human-readable reasons the
 * gate held it. Pure data shaping — no DB, no React, no `server-only` — so it
 * is unit-testable with plain fixtures and safely importable from both the
 * server page (`accounting-data.ts` rows) and the client inspector.
 *
 * Money stays a decimal STRING throughout (the domain transport, see
 * `_shared/accounting-format.ts`); this module never touches a bigint minor-
 * unit amount and never rounds-trips a displayed number back into a posting.
 */

/** One held write's `input_json` + `output_json`, as read by `fetchHeldWrites`. */
export interface HeldWriteReviewSource {
  id: string
  tool_name: string
  conversation_id: string | null
  rationale: string | null
  /** Resolved server-side (accounting_event / counterparty join); null when unresolved. */
  counterparty_name: string | null
  input_json: unknown
  output_json: unknown
}

export interface HeldWriteVatSummaryRow {
  /** Raw VAT rate string ("21"), or null when the line carries no numeric rate (exempt / reverse-charge / outside VAT). */
  rate: string | null
  /** Display label — "21 %" when a rate is present, else the VAT-mode label. */
  rateLabel: string
  /** Rolled-up base amount across every line at this rate — decimal string, 2dp. */
  base: string
  /** Rolled-up VAT amount across every line at this rate — decimal string, 2dp. */
  vat: string
}

export interface HeldWriteHeader {
  counterpartyName: string | null
  /** Designation (Označení) — null pre-approval; the number series allocates it only when the write applies. */
  documentNumber: string | null
  /** ISO date/datetime as carried by the payload (occurredAt / issuedAt / postingDate). */
  date: string | null
  /** Decimal-string total (base + VAT, or the double-entry debit total); null when the tool has no derivable amount. */
  totalAmount: string | null
  currency: string | null
}

export interface HeldWriteViewModel {
  id: string
  toolName: string
  conversationId: string | null
  header: HeldWriteHeader
  vatSummary: HeldWriteVatSummaryRow[]
  /** Human-readable reasons the gate HELD this write (server veto + score verdict). */
  holdReasons: string[]
  rationale: string | null
}

export interface HeldWriteCaseGroup {
  conversationId: string | null
  writes: HeldWriteViewModel[]
}

// ---------------------------------------------------------------------------
// Small parsing helpers — display-only decimal math (see accounting-format.ts).
// ---------------------------------------------------------------------------

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null
}

/** Parse a decimal string ("12100.00") to a JS number — DISPLAY ONLY. */
function toNumber(value: unknown): number {
  if (typeof value !== "string") return 0
  const n = Number(value)
  return Number.isFinite(n) ? n : 0
}

/** Format a JS number back to a canonical 2dp decimal string — DISPLAY ONLY. */
function toDecimal(value: number): string {
  return value.toFixed(2)
}

const VAT_MODE_LABELS: Record<string, string> = {
  STANDARD: "základní režim",
  REVERSE_CHARGE: "přenesená daňová povinnost",
  EXEMPT: "osvobozeno",
  OUTSIDE_VAT: "mimo předmět DPH",
  IMPORT: "dovoz",
}

// ---------------------------------------------------------------------------
// Why-held reasons — decoded from output_json.serverGate (accounting-writes.gate.ts).
// ---------------------------------------------------------------------------

/** Known infra-signal kinds (accounting-veto.ts + brain/confidence/signals.ts), human-labeled. Unknown kinds fall back to the raw string. */
const SIGNAL_LABELS: Record<string, string> = {
  asset_vs_expense: "možná záměna aktivum / náklad (DHM ≥ 40 000 Kč)",
  unverified_vat_regime: "neověřitelný režim DPH",
  vat_amount_missing: "chybí částka DPH k ověření",
  vat_mismatch: "nesoulad vypočtené a uvedené DPH",
  novel_template: "nepotvrzená OCR šablona",
  unverified_template: "OCR bez potvrzené šablony",
}

function signalLabel(signal: string): string {
  return SIGNAL_LABELS[signal] ?? signal
}

/** Translate one `serverGate.score.reasons` entry (gate.ts `deriveReasons`) into Czech prose. */
function translateScoreReason(reason: string): string {
  const blocked = /^blocked: (.+)$/.exec(reason)
  if (blocked?.[1]) return `Blokováno: ${signalLabel(blocked[1])}`
  const capped = /^capped by (.+) at ([\d.]+)$/.exec(reason)
  if (capped?.[1] && capped[2]) {
    return `Omezeno signálem „${signalLabel(capped[1])}“ na jistotu ${capped[2]}`
  }
  const below = /^below green threshold ([\d.]+)$/.exec(reason)
  if (below?.[1])
    return `Jistota pod prahem pro automatické zaúčtování (${below[1]})`
  return reason
}

/**
 * Human-readable hold reasons from `output_json.serverGate` — the independent
 * server VETO (`veto.signals`, only when `veto.held`) plus the score verdict's
 * `reasons` (skipping the literal "green", which cannot explain a hold). The
 * template-novelty flags (`templateNovel` / `ocrUnverified`) are NOT re-added
 * here: the gate injects them as fired signals INTO the score, so a fired one
 * already surfaces as "blocked: novel_template" / "blocked: unverified_template"
 * via `score.reasons` — adding them again would duplicate the same reason.
 */
export function holdReasonsFrom(outputJson: unknown): string[] {
  if (!isRecord(outputJson)) return []
  const gate = outputJson["serverGate"]
  if (!isRecord(gate)) return []

  const reasons: string[] = []

  const veto = gate["veto"]
  if (
    isRecord(veto) &&
    veto["held"] === true &&
    Array.isArray(veto["signals"])
  ) {
    for (const s of veto["signals"]) {
      if (typeof s === "string")
        reasons.push(`Ověřovací kontrola: ${signalLabel(s)}`)
    }
  }

  const score = gate["score"]
  if (isRecord(score) && Array.isArray(score["reasons"])) {
    for (const r of score["reasons"]) {
      if (typeof r === "string" && r !== "green")
        reasons.push(translateScoreReason(r))
    }
  }

  return [...new Set(reasons)]
}

// ---------------------------------------------------------------------------
// Per-tool header + VAT-summary shaping.
// ---------------------------------------------------------------------------

/** Flatten a `captureAccountingDocument` payload's `lines[].partials[]` into one list. */
function capturePartials(
  input: Record<string, unknown>,
): Record<string, unknown>[] {
  const lines = Array.isArray(input["lines"]) ? input["lines"] : []
  const partials: Record<string, unknown>[] = []
  for (const line of lines) {
    if (!isRecord(line)) continue
    const linePartials = Array.isArray(line["partials"]) ? line["partials"] : []
    for (const p of linePartials) {
      if (isRecord(p)) partials.push(p)
    }
  }
  return partials
}

/** Roll partials up per VAT rate (base + VAT summed, decimal strings) — the per-line rollup by rate. */
function vatSummaryFromPartials(
  partials: Record<string, unknown>[],
): HeldWriteVatSummaryRow[] {
  const byKey = new Map<
    string,
    { rate: string | null; rateLabel: string; base: number; vat: number }
  >()
  for (const p of partials) {
    const rate = asString(p["vatRate"])
    const mode = asString(p["vatMode"]) ?? "STANDARD"
    const key = rate ?? `mode:${mode}`
    const rateLabel = rate ? `${rate} %` : (VAT_MODE_LABELS[mode] ?? mode)
    const existing = byKey.get(key) ?? { rate, rateLabel, base: 0, vat: 0 }
    existing.base += toNumber(p["baseAmount"])
    existing.vat += toNumber(p["vatAmount"])
    byKey.set(key, existing)
  }
  return [...byKey.values()]
    .sort((a, b) => a.rateLabel.localeCompare(b.rateLabel))
    .map((r) => ({
      rate: r.rate,
      rateLabel: r.rateLabel,
      base: toDecimal(r.base),
      vat: toDecimal(r.vat),
    }))
}

function headerFromEvent(
  input: Record<string, unknown>,
  counterpartyName: string | null,
): HeldWriteHeader {
  return {
    counterpartyName,
    documentNumber: null,
    date: asString(input["occurredAt"]),
    totalAmount: null,
    currency: null,
  }
}

function headerFromCapture(
  input: Record<string, unknown>,
  partials: Record<string, unknown>[],
  counterpartyName: string | null,
): HeldWriteHeader {
  const totalBase = partials.reduce((s, p) => s + toNumber(p["baseAmount"]), 0)
  const totalVat = partials.reduce((s, p) => s + toNumber(p["vatAmount"]), 0)
  const currency = partials
    .map((p) => asString(p["currencyCode"]))
    .find((c): c is string => c !== null)
  return {
    counterpartyName,
    documentNumber: null,
    date: asString(input["issuedAt"]),
    totalAmount: partials.length > 0 ? toDecimal(totalBase + totalVat) : null,
    currency: currency ?? "CZK",
  }
}

function headerFromPosting(
  input: Record<string, unknown>,
  counterpartyName: string | null,
): HeldWriteHeader {
  const entry = isRecord(input["entry"]) ? input["entry"] : {}
  const lines = Array.isArray(entry["lines"]) ? entry["lines"] : []
  const isDouble = input["kind"] === "double"
  const relevant = isDouble
    ? lines.filter((l) => isRecord(l) && l["side"] === "DEBIT")
    : lines
  const total = relevant.reduce(
    (s, l) => s + (isRecord(l) ? toNumber(l["amount"]) : 0),
    0,
  )
  return {
    counterpartyName,
    documentNumber: null,
    date: asString(entry["postingDate"]),
    totalAmount: lines.length > 0 ? toDecimal(total) : null,
    // Postings settle in the accounting currency (CZK) — no currencyCode on the payload.
    currency: "CZK",
  }
}

/**
 * Shape ONE held-write row into its review view-model: document header,
 * per-rate VAT summary, why-held reasons, and the rationale. `conversationId`
 * is carried through untouched so callers can group sibling writes for the
 * same účetní případ (see `groupHeldWritesByCase`).
 */
export function buildHeldWriteViewModel(
  row: HeldWriteReviewSource,
): HeldWriteViewModel {
  const input = isRecord(row.input_json) ? row.input_json : {}

  let header: HeldWriteHeader
  let vatSummary: HeldWriteVatSummaryRow[] = []

  switch (row.tool_name) {
    case "captureAccountingDocument": {
      const partials = capturePartials(input)
      header = headerFromCapture(input, partials, row.counterparty_name)
      vatSummary = vatSummaryFromPartials(partials)
      break
    }
    case "createAccountingPosting":
      header = headerFromPosting(input, row.counterparty_name)
      break
    case "createAccountingEvent":
    default:
      header = headerFromEvent(input, row.counterparty_name)
      break
  }

  return {
    id: row.id,
    toolName: row.tool_name,
    conversationId: row.conversation_id,
    header,
    vatSummary,
    holdReasons: holdReasonsFrom(row.output_json),
    rationale: row.rationale,
  }
}

/**
 * Group held writes by their `conversationId` (the účetní případ / audit
 * correlation id) so multiple writes for one case — e.g. the event creation
 * plus its document capture — render together. A write with no
 * `conversationId` groups alone (there is no case to share it with).
 * Preserves first-seen order.
 */
export function groupHeldWritesByCase(
  writes: HeldWriteViewModel[],
): HeldWriteCaseGroup[] {
  const groups = new Map<string, HeldWriteCaseGroup>()
  const order: string[] = []
  for (const write of writes) {
    const key = write.conversationId ?? `solo:${write.id}`
    let group = groups.get(key)
    if (!group) {
      group = { conversationId: write.conversationId, writes: [] }
      groups.set(key, group)
      order.push(key)
    }
    group.writes.push(write)
  }
  return order.map((key) => groups.get(key) as HeldWriteCaseGroup)
}
