/**
 * Held-write review view-model — shapes a raw `tool_call_log` held row (the
 * gate's `input_json` + `output_json`) into what a human reviewer needs: a
 * document header, a per-rate VAT rollup, an MD/D posting preview, double-entry
 * posting lines, and the human-readable reasons the gate held it. Pure data
 * shaping — no DB, no React, no `server-only` — so it is unit-testable with
 * plain fixtures and safely importable from both the server page
 * (`accounting-data.ts` rows) and the client inspector. `edit-model.ts` (M1.7
 * edit-before-approve) reuses the same grouping (`vatGroupLabel`) to merge a
 * reviewer's edit back onto the ORIGINAL payload, so the two can never disagree
 * on what a row represents.
 *
 * Money stays a decimal STRING throughout (the domain transport, see
 * `_shared/accounting-format.ts`); this module never touches a bigint minor-
 * unit amount and never rounds-trips a displayed number back into a posting.
 *
 * [M1.3] MD/D preview (`buildMddPreview`) — "see how it booked MD/D" before
 * approving. It is PURE and READ-ONLY: no posting, no persisted read of its
 * own (any chart-of-accounts labels are passed in by the caller, already
 * fetched once for the whole page). It reuses the EXISTING předkontace
 * pipeline verbatim — `classifyEvent` (the law-cited decision layer,
 * `packages/accounting/src/classify.ts`) picks the scenario, and
 * `expandScenarioEntries` (the DB-free core `expandPartialRecord` also calls,
 * `packages/accounting/src/predkontace/expand.ts`) turns it into lines — never
 * a second, divergent expander. A raw `captureAccountingDocument` doesn't
 * carry a `scenario` id (that only exists once M1.2's write-body wiring
 * lands), so the preview RE-DERIVES it from the same facts `classify_accounting_event`
 * would have seen; a durable asset's capitalisation and časové rozlišení
 * (§3/1) can't be re-derived (a capture payload carries no `durable`/service-window
 * facts), so those partials are skipped with an explicit caveat rather than
 * guessed. A `createAccountingPosting` (kind "double") already IS the MD/D —
 * its lines are shown verbatim, no scenario involved.
 */
import {
  classifyEvent,
  expandScenarioEntries,
  getScenario,
  type Section92CommodityCode,
  type SupplyKind,
  type VatJurisdiction,
} from "@workspace/accounting"
import { stripGateEnvelope } from "@workspace/shared/api"

/** One held write's `input_json` + `output_json`, as read by `fetchHeldWrites`. */
export interface HeldWriteReviewSource {
  id: string
  tool_name: string
  conversation_id: string | null
  rationale: string | null
  /** Resolved server-side (accounting_event / counterparty join); null when unresolved. */
  counterparty_name: string | null
  /** Označení of the účetní případ (`ae.designation`, e.g. `UC2025000005`); null when no event resolves. */
  case_designation?: string | null
  /** účetní případ description (`ae.description`) — carries the supplier/context when no counterparty is linked. */
  case_description?: string | null
  /** Označení of the doklad a posting books from (`sr.designation`, e.g. `FP20250005`); null otherwise. */
  document_designation?: string | null
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
  /**
   * [M1.7] Number of original partials rolled up into this row. The
   * edit-before-approve UI only lets a reviewer edit a row's amounts when
   * this is 1 — an unambiguous 1:1 mapping back onto the original partial.
   * A rolled-up group of 2+ partials at the same rate stays read-only (no
   * safe way to redistribute one edited total across several source lines).
   */
  partialCount: number
}

/** One double-entry posting line (MD/D) — accountId + side + amount, as booked. */
export interface HeldWritePostingLineRow {
  accountId: string
  side: "DEBIT" | "CREDIT"
  amount: string
}

/** The `openObligation` directive on a held `createAccountingPosting`, shaped for the review. */
interface HeldWriteObligation {
  saldoAccountNumber: string
  direction: "RECEIVABLE" | "PAYABLE"
  issueDate: string | null
  dueDate: string | null
  variableSymbol: string | null
}

export interface HeldWriteHeader {
  counterpartyName: string | null
  /**
   * The EXTRACTED counterparty IČO / DIČ carried on a held `createAccountingEvent` payload
   * (`input_json.counterparty.{ico,dic}`). The server find-or-creates the counterparty by IČO → DIČ →
   * name PRECEDENCE, so the IČO is the field that BINDS the partner — it must be visible to the reviewer,
   * not just the name (a mis-OCR'd-but-valid IČO with a right-looking name would otherwise bind the wrong
   * real partner undetectably). Null for capture/posting writes (their identity lives on the event).
   */
  counterpartyIco: string | null
  counterpartyDic: string | null
  /** Označení of the účetní případ this write books (`UC2025…`) — null when no event resolves. */
  caseDesignation: string | null
  /** účetní případ description — the supplier/context text, shown when no counterparty row is linked. */
  caseDescription: string | null
  /** Designation (Označení) of the doklad — a posting's linked `sr.designation` (`FP2025…`); null pre-allocation for tools that mint it only on apply. */
  documentNumber: string | null
  /**
   * The saldokonto obligation a `createAccountingPosting` will ALSO open (the `openObligation` directive),
   * or null. Surfaced so the reviewer sees that approving this posting opens a tracked pohledávka/závazek —
   * against which účet, in which direction, with what splatnost/VS — not just the MD/D lines (two postings
   * with identical lines, one that merely posts and one that also opens an obligation, must NOT look alike).
   */
  obligation: HeldWriteObligation | null
  /** ISO date/datetime as carried by the payload (occurredAt / issuedAt / postingDate). */
  date: string | null
  /** Decimal-string total (base + VAT, or the double-entry debit total); null when the tool has no derivable amount. */
  totalAmount: string | null
  currency: string | null
}

/** Chart-of-accounts row the caller already fetched once for the whole page (`fetchChartAccounts`) — used ONLY to label an account number/id for display, never to compute the preview itself. */
export interface ChartAccountLookup {
  id: string
  number: string
  name: string
}

/** One MD/D preview line — an account NUMBER (never a raw uuid), the side, the amount, and a human label. */
interface MddPreviewLine {
  account: string
  side: "DEBIT" | "CREDIT"
  /** Decimal string, 2dp — DISPLAY ONLY (see module header). */
  amount: string
  /** Account name, or the předkontace entry's own description — null when neither resolves. */
  label: string | null
}

/**
 * [M1.3] MD/D posting preview for a held write — either the předkontace
 * scenario re-derived from a raw capture's partials, or the verbatim lines of
 * an already-proposed `createAccountingPosting`. Null when the tool/kind has
 * no double-entry preview to show (an event, a monetary/cash posting, or a
 * capture whose facts can't be classified at all).
 */
export interface MddPreview {
  /** Předkontace scenario id — null for a direct posting (no scenario, already MD/D) or a multi-scenario capture. */
  scenarioId: string | null
  scenarioLabel: string | null
  lines: MddPreviewLine[]
  /** Decimal string, 2dp — sum of every DEBIT line. */
  totalDebit: string
  /** Decimal string, 2dp — sum of every CREDIT line. */
  totalCredit: string
  /** Σ(MD) = Σ(Dal) — always true for a verbatim posting; a re-derived capture preview should also balance (each scenario entry set does), a mismatch signals a classification/rounding issue worth flagging to the reviewer. */
  balanced: boolean
  /** Non-blocking caveats about what this preview does NOT model (e.g. capitalisation, časové rozlišení). */
  caveats: string[]
}

/**
 * One labeled key/value row for the reviewer detail panel — the generic
 * fallback section used by tools that carry no document header / VAT / MD/D
 * shape of their own (the Tier-3 register-card creators, and any future op that
 * is otherwise blind). `value` is a pre-humanized display string (Czech enum
 * labels, decimal-string amounts, ISO dates) — the renderer prints it verbatim.
 */
export interface HeldWriteDetailRow {
  label: string
  value: string
}

export interface HeldWriteViewModel {
  id: string
  toolName: string
  conversationId: string | null
  header: HeldWriteHeader
  /**
   * A labeled key/value detail section for ops with no VAT/MD-D shape (the
   * Tier-3 register-card creators + the generic fallback for any unmapped op, so
   * a future tool is never rendered blind). Empty for the document-centric ops
   * (event / capture / posting) that render via `header` + `vatSummary` + `mddPreview`.
   */
  details: HeldWriteDetailRow[]
  /** Heading for the `details` section (e.g. "Detaily karty majetku"), or null when there are none. */
  detailsTitle: string | null
  vatSummary: HeldWriteVatSummaryRow[]
  /** Human-readable reasons the gate HELD this write (server veto + score verdict). */
  holdReasons: string[]
  rationale: string | null
  /**
   * [M1.7] Double-entry posting lines (MD/D), only for a `createAccountingPosting`
   * of kind "double" — empty for events, document captures, and monetary/cash
   * postings (their lines carry no accountId, see PostInput's MonetaryLineInput).
   * Feeds the edit-before-approve draft (the reviewer edits these before
   * approving); the read-only display of the proposed booking is `mddPreview`.
   */
  postingLines: HeldWritePostingLineRow[]
  /** [M1.7] "double" / "monetary" for a posting, else null — drives whether postingLines is editable. */
  postingKind: "double" | "monetary" | null
  /** [M1.3] MD/D posting preview — null when this tool/kind has none (see `MddPreview`). */
  mddPreview: MddPreview | null
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

/**
 * Display label for one VAT-partial group ("21 %" when a rate is present,
 * else the VAT-mode label). Exported so `edit-model.ts` groups an edited
 * amount back onto the SAME partials `vatSummaryFromPartials` rolled it from
 * — single source of truth, the two can never drift apart.
 */
export function vatGroupLabel(rate: string | null, mode: string): string {
  return rate ? `${rate} %` : (VAT_MODE_LABELS[mode] ?? mode)
}

// ---------------------------------------------------------------------------
// Why-held reasons — decoded from output_json.serverGate (accounting-writes.gate.ts).
// ---------------------------------------------------------------------------

/**
 * Known infra-signal kinds, human-labeled. Two sources:
 *  - `accounting-veto.ts` (`unverified_vat_regime` / `vat_amount_missing` / `vat_mismatch`) — the
 *    independent server veto's own signals.
 *  - `packages/brain/src/confidence/signals.ts` — the FULL block/defer/cap taxonomy the score
 *    verdict's `reasons` can name (Tier-1 BLOCK, Tier-3 DEFER, the `spolek_scope` force-defer, and
 *    every Tier-2 review cap). Every kind from that catalog MUST have an entry here — an unlabeled
 *    kind means a held write shows raw jargon (e.g. "extraction_failed") to a Czech-only reviewer.
 * Unknown/future kinds fall back to the raw string (see `signalLabel`) — never crash.
 */
const SIGNAL_LABELS: Record<string, string> = {
  // accounting-veto.ts — server veto's own signals (not in signals.ts).
  unverified_vat_regime: "neověřitelný režim DPH",
  vat_amount_missing: "chybí částka DPH k ověření",

  // Tier-1 hard block (signals.ts TIER1_BLOCK_KINDS) — forces confidence to 0.
  no_source_doc: "chybí zdrojový doklad",
  closed_period: "účetní období je uzavřené",
  constitution_violation: "porušení provozních zásad Brain (constitution)",
  balance_mismatch: "nesedí saldo, debet a kredit se neshodují",
  duplicate_key_collision: "možný duplicitní doklad, kolize klíče",

  // Tier-3 defer (signals.ts TIER3_DEFER_KINDS) — cannot be scored/trusted, routed to the deferred pile.
  extraction_failed: "extrakce dokladu selhala, nutná ruční kontrola",
  period_unknown: "nelze určit účetní období",
  budget_exceeded: "vyčerpán rozpočet na automatické zpracování",
  hitl_timeout: "vypršel čas na lidské schválení (HITL timeout)",
  novel_template: "nepotvrzená OCR šablona",
  unverified_template: "OCR bez potvrzené šablony",

  // Force-defer (signals.ts FORCE_DEFER_KINDS) — spolek is out of scope (starter scope = s.r.o. + OSVČ).
  spolek_scope: "mimo podporovaný rozsah, spolek zatím není podporován",

  // Tier-2 review caps (signals.ts TIER2_CAP_VALUES) — confidence capped sub-green, never blocked outright.
  reverse_charge_candidate: "možná přenesená daňová povinnost",
  pdf_low_confidence: "nízká jistota čtení PDF dokladu",
  novel_ico: "neznámé IČO protistrany",
  multi_source_conflict: "rozpor mezi zdrojovými doklady",
  kb_rule_amber_red: "pravidlo znalostní báze označeno jako rizikové",
  novel_bank_pattern: "neobvyklý vzor bankovní transakce",
  vat_mismatch: "nesoulad vypočtené a uvedené DPH",
  kb_rule_low: "nízká jistota pravidla znalostní báze",
  trajectory_instability: "nestabilní vývoj jistoty v čase",
  amount_near_threshold: "částka blízko rozhodné hranice",
  asset_vs_expense: "možná záměna aktivum / náklad (DHM ≥ 40 000 Kč)",
  accrual_period_boundary: "časové rozlišení přesahuje hranici období",
  reserve_or_impairment: "rezerva nebo opravná položka vyžaduje posouzení",
  dph_tax_point_timing: "nejistota v okamžiku vzniku daňové povinnosti (DUZP)",
  prior_without_source: "dřívější zápis bez podkladového dokladu",
  counterparty_register_mismatch:
    "název protistrany neodpovídá rejstříku ARES (ověřte IČO)",
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
    {
      rate: string | null
      rateLabel: string
      base: number
      vat: number
      partialCount: number
    }
  >()
  for (const p of partials) {
    const rate = asString(p["vatRate"])
    const mode = asString(p["vatMode"]) ?? "STANDARD"
    const key = rate ?? `mode:${mode}`
    const rateLabel = vatGroupLabel(rate, mode)
    const existing = byKey.get(key) ?? {
      rate,
      rateLabel,
      base: 0,
      vat: 0,
      partialCount: 0,
    }
    existing.base += toNumber(p["baseAmount"])
    existing.vat += toNumber(p["vatAmount"])
    existing.partialCount += 1
    byKey.set(key, existing)
  }
  return [...byKey.values()]
    .sort((a, b) => a.rateLabel.localeCompare(b.rateLabel))
    .map((r) => ({
      rate: r.rate,
      rateLabel: r.rateLabel,
      base: toDecimal(r.base),
      vat: toDecimal(r.vat),
      partialCount: r.partialCount,
    }))
}

/**
 * [M1.7] Double-entry posting lines for a `createAccountingPosting` of kind
 * "double" — empty for every other tool/kind (events and document captures
 * have no `entry.lines`; a monetary/cash posting's lines carry no accountId).
 */
function postingLinesFromInput(
  input: Record<string, unknown>,
): HeldWritePostingLineRow[] {
  if (input["kind"] !== "double") return []
  const entry = isRecord(input["entry"]) ? input["entry"] : {}
  const lines = Array.isArray(entry["lines"]) ? entry["lines"] : []
  return lines.filter(isRecord).map((line) => ({
    accountId: asString(line["accountId"]) ?? "",
    side: line["side"] === "CREDIT" ? "CREDIT" : "DEBIT",
    amount: typeof line["amount"] === "string" ? line["amount"] : "0.00",
  }))
}

// ---------------------------------------------------------------------------
// [M1.3] MD/D preview — see the module header for the reuse contract.
// ---------------------------------------------------------------------------

function accountByNumber(
  accounts: ChartAccountLookup[],
  number: string,
): ChartAccountLookup | undefined {
  return accounts.find((a) => a.number === number)
}

function accountById(
  accounts: ChartAccountLookup[],
  id: string,
): ChartAccountLookup | undefined {
  return accounts.find((a) => a.id === id)
}

/** Round to 2dp, half-away-from-zero — matches the §37 ZDPH self_assessed_vat convention. DISPLAY ONLY. */
function round2dp(n: number): number {
  return (Math.sign(n) * Math.round(Math.abs(n) * 100)) / 100
}

// ---------------------------------------------------------------------------
// Exact money math for the MD/D balance. Money is a decimal STRING at
// numeric(19,4) precision (ADR-0013 — the `Money<Currency>` brand is
// compile-time only, the domain does its arithmetic in SQL). The MD/D preview
// still has to prove Σ(MD) = Σ(Dal), so it sums line amounts as EXACT integer
// minor units (ten-thousandths) and compares them for equality — never a float
// sum, never a `< 0.005` epsilon (repo domain rule: never native `number` for
// money). bigint, not number: a numeric(19,4) amount can exceed 2^53 minor
// units (see packages/shared `MoneySchema`). Display stays 2dp.
// ---------------------------------------------------------------------------

/**
 * Parse a decimal money string ("12100.00", "-100.0040") to exact integer
 * minor units (ten-thousandths, matching numeric(19,4)). A non-numeric input
 * returns 0n — mirrors the display-safe `toNumber` fallback so a malformed
 * amount degrades quietly instead of crashing the read-only review render.
 */
function toMinorUnits(value: string): bigint {
  const match = /^(-?)(\d*)(?:\.(\d+))?$/.exec(value.trim())
  if (!match) return 0n
  const [, sign, whole = "", frac = ""] = match
  const fracScaled = (frac + "0000").slice(0, 4)
  const units = BigInt(whole || "0") * 10000n + BigInt(fracScaled || "0")
  return sign === "-" ? -units : units
}

/** Format exact integer minor units (ten-thousandths) back to a canonical 2dp decimal string — DISPLAY ONLY. */
function formatMinorUnits(units: bigint): string {
  const negative = units < 0n
  const abs = negative ? -units : units
  // Round ten-thousandths → hundredths, half away from zero (abs is non-negative).
  const cents = (abs + 50n) / 100n
  const formatted = `${cents / 100n}.${(cents % 100n).toString().padStart(2, "0")}`
  return negative ? `-${formatted}` : formatted
}

function finalizeMddPreview(
  scenarioId: string | null,
  scenarioLabel: string | null,
  lines: MddPreviewLine[],
  caveats: string[],
): MddPreview {
  const totalDebit = lines
    .filter((l) => l.side === "DEBIT")
    .reduce((sum, l) => sum + toMinorUnits(l.amount), 0n)
  const totalCredit = lines
    .filter((l) => l.side === "CREDIT")
    .reduce((sum, l) => sum + toMinorUnits(l.amount), 0n)
  return {
    scenarioId,
    scenarioLabel,
    lines,
    totalDebit: formatMinorUnits(totalDebit),
    totalCredit: formatMinorUnits(totalCredit),
    balanced: totalDebit === totalCredit,
    caveats,
  }
}

/**
 * MD/D preview for an already-proposed `createAccountingPosting`. Its lines
 * ARE the double entry — no scenario/expander involved, just resolve each
 * `accountId` to a number/name for display (a "monetary" kind has no
 * double-entry lines to preview — předkontace/MD-D is double-entry only, see
 * `expand.ts`'s own doc comment).
 */
function mddPreviewFromPosting(
  input: Record<string, unknown>,
  chartAccounts: ChartAccountLookup[],
): MddPreview | null {
  if (input["kind"] !== "double") return null
  const entry = isRecord(input["entry"]) ? input["entry"] : {}
  const rawLines = Array.isArray(entry["lines"]) ? entry["lines"] : []
  const lines: MddPreviewLine[] = rawLines.filter(isRecord).map((l) => {
    const accountId = asString(l["accountId"]) ?? ""
    const account = accountById(chartAccounts, accountId)
    return {
      account: account?.number ?? accountId,
      side: l["side"] === "CREDIT" ? "CREDIT" : "DEBIT",
      amount: typeof l["amount"] === "string" ? l["amount"] : "0.00",
      label: account?.name ?? null,
    }
  })
  if (lines.length === 0) return null
  return finalizeMddPreview(null, null, lines, [])
}

/** `captureAccountingDocument.type` → the `direction` `classifyEvent` needs; null for a non-invoice document (bank statement, cash document, …) that doesn't book through předkontace. */
function directionFromCaptureType(
  type: string | null,
): "RECEIVED" | "ISSUED" | null {
  if (type === "RECEIVED_INVOICE") return "RECEIVED"
  if (type === "ISSUED_INVOICE") return "ISSUED"
  return null
}

/**
 * MD/D preview for a raw `captureAccountingDocument` — no scenario id on the
 * payload yet (that only exists once M1.2's write-body wiring lands), so this
 * RE-DERIVES the scenario via `classifyEvent` fed with exactly the facts a
 * partial carries, then expands it via `expandScenarioEntries` (the SAME
 * pure core `expandPartialRecord` uses — see the module header). Amounts are
 * computed in JS from the partial's own decimal strings (DISPLAY ONLY, no
 * persisted read, no posting — matches the existing `toNumber`/`toDecimal`
 * convention already used for the VAT-rollup above).
 *
 * A durable-asset purchase (`supplyKind: "ASSET"`) is SKIPPED rather than
 * guessed: capitalisation depends on `durable`/`assetThreshold`, neither of
 * which a capture payload carries, so a confident 501/518-vs-042 preview
 * would risk showing the WRONG account to the reviewer. časové rozlišení
 * (§3/1) is never modeled here either (no serviceWindow/periodEnd on a
 * capture) — both gaps are surfaced as caveats, not silently guessed.
 *
 * A credit note (dobropis, §42) is detected from a NEGATIVE captured
 * base/VAT (a capture partial carries no explicit `isCreditNote` fact) and
 * routed through `classifyEvent` with `isCreditNote: true` — so a STANDARD
 * credit note previews through the reverse-side template (P-/S-CREDIT-NOTE-STD)
 * instead of a normal-sided invoice. A credit-note caveat is always surfaced
 * because a special-VAT-regime (PDP/EU/import) credit note reverses its sign
 * only at the posting layer, which the předkontace expander does not model.
 *
 * The whole per-partial derivation (`classifyEvent` + `expandScenarioEntries`)
 * runs inside one try/catch: a derivation error (an implausible vat_rate, or a
 * future catalogue scenario reaching a non-SQL amount basis) degrades to a
 * SKIP + caveat for that partial, never throws up into the read-only page.
 */
function mddPreviewFromCapture(
  input: Record<string, unknown>,
  partials: Record<string, unknown>[],
  chartAccounts: ChartAccountLookup[],
): MddPreview | null {
  const direction = directionFromCaptureType(asString(input["type"]))
  if (!direction) return null

  const caveats = [
    "Náhled je odvozen ze zachycených údajů dokladu (classifyEvent) — nezohledňuje časové rozlišení mezi obdobími (§3/1); skutečné zaúčtování rozhoduje classify_accounting_event.",
  ]
  const lines: MddPreviewLine[] = []
  const scenarioIds = new Set<string>()
  let skippedAsset = false
  let skippedAdvance = false
  let skippedUnclassifiedSupply = false
  let skippedUnclassifiable = false
  let hasCreditNote = false

  for (const p of partials) {
    // #779: mirror EXACTLY what `bookDocument` does with `supply_kind` so the preview never shows a posting
    // the approve would then refuse to book. The booker FAILS CLOSED (holds the document) on a null
    // supply_kind, on ASSET (capitalisation facts absent), and on ADVANCE (§37a settlement not modelled) —
    // book-document.ts:216-235. Previously an absent supplyKind defaulted to "OTHER" and previewed a confident
    // 548 posting that the approve transaction then threw on — a confident-wrong DISPLAY. Now each of those
    // three holds is surfaced as a caveat, not a fabricated account.
    const rawSupplyKind = asString(p["supplyKind"])
    if (rawSupplyKind == null) {
      skippedUnclassifiedSupply = true
      continue
    }
    const supplyKind = rawSupplyKind as SupplyKind
    if (supplyKind === "ASSET") {
      skippedAsset = true
      continue
    }
    if (supplyKind === "ADVANCE") {
      skippedAdvance = true
      continue
    }
    const jurisdiction = (asString(p["vatJurisdiction"]) ??
      "DOMESTIC") as VatJurisdiction
    const baseAmount =
      typeof p["baseAmount"] === "string" ? p["baseAmount"] : "0"
    const vatAmount = typeof p["vatAmount"] === "string" ? p["vatAmount"] : "0"
    // A credit note (dobropis) may be captured with a NEGATIVE base/VAT and no
    // explicit `isCreditNote` fact — flag it so classifyEvent routes a STANDARD
    // one through the reverse-side template (P-/S-CREDIT-NOTE-STD). The entry
    // AMOUNTS are magnitudes (the catalogue's credit-note scenarios already
    // encode the reversed sides; the poster flips a negative total to positive
    // — see catalogue.ts's S-/P-CREDIT-NOTE-STD comments).
    const isCreditNote =
      toNumber(baseAmount) < 0 ||
      toNumber(vatAmount) < 0 ||
      supplyKind === "CREDIT_NOTE"
    const base = Math.abs(toNumber(baseAmount))
    const vat = Math.abs(toNumber(vatAmount))
    const vatRate = asString(p["vatRate"])
    const commodityCode = asString(
      p["commodityCode"],
    ) as Section92CommodityCode | null

    // The full derivation is inside the try: BOTH classifyEvent (implausible
    // rate) and expandScenarioEntries (a future non-SQL-basis scenario) can
    // throw — a failure skips this partial with a caveat, never crashes render.
    try {
      const decision = classifyEvent({
        direction,
        supplyKind,
        jurisdiction,
        base: base.toFixed(2),
        vat: vat.toFixed(2),
        vatRate,
        currency: asString(p["currencyCode"]) ?? "CZK",
        isCreditNote,
        commodityCode: commodityCode ?? undefined,
      })
      const rate = vatRate ? Number(vatRate) : 0
      const amounts = {
        net: base.toFixed(2),
        vat: vat.toFixed(2),
        gross: (base + vat).toFixed(2),
        self_assessed_vat: round2dp((base * rate) / 100).toFixed(2),
      }
      const scenarioLines = expandScenarioEntries(decision.scenario, amounts, {
        accountOverrides: decision.accountOverrides,
      })
      scenarioIds.add(decision.scenario)
      if (isCreditNote) hasCreditNote = true
      for (const line of scenarioLines) {
        const account = accountByNumber(chartAccounts, line.account)
        lines.push({
          account: line.account,
          side: line.side,
          amount: line.amount,
          label: line.description ?? account?.name ?? null,
        })
      }
    } catch {
      // Unclassifiable (implausible vat_rate) or unexpandable (a future
      // non-SQL amount basis) — skip this partial, keep the rest of the doc.
      skippedUnclassifiable = true
    }
  }

  if (skippedAsset) {
    caveats.push(
      "Dlouhodobý majetek (ASSET) v položkách dokladu — kapitalizace se u náhledu nezachycuje, protože zachycený doklad nenese informaci o době použitelnosti.",
    )
  }
  if (skippedAdvance) {
    caveats.push(
      "Záloha (ADVANCE, §37a) v položkách dokladu — vypořádání zálohové DPH se automaticky neúčtuje; doklad se při schválení podrží k ručnímu posouzení a v náhledu se tato položka nezobrazuje jako zaúčtování.",
    )
  }
  if (skippedUnclassifiedSupply) {
    caveats.push(
      "U některé položky není určen druh plnění — nákladový účet nelze bezpečně odvodit, takže se doklad při schválení podrží k ručnímu posouzení; náhled tuto položku nezobrazuje jako zaúčtování (neúčtuje se na odhadnutý účet).",
    )
  }
  if (hasCreditNote) {
    caveats.push(
      "Detekován dobropis (opravný daňový doklad, §42) — u standardního režimu DPH náhled obrací strany MD/D; u zvláštních režimů (PDP / EU / dovoz) ověřte směr proti zdrojovému dokladu.",
    )
  }
  if (skippedUnclassifiable) {
    caveats.push(
      "Některou položku dokladu nebylo možné zařadit (např. neplatná sazba DPH) — v náhledu je vynechána.",
    )
  }
  if (lines.length === 0) return null

  const [firstScenario] = scenarioIds
  const scenarioId = scenarioIds.size === 1 ? (firstScenario ?? null) : null
  const scenarioLabel = scenarioId ? getScenario(scenarioId).label : null
  return finalizeMddPreview(scenarioId, scenarioLabel, lines, caveats)
}

function headerFromEvent(
  input: Record<string, unknown>,
  counterpartyName: string | null,
): HeldWriteHeader {
  // The extracted identity the server will find-or-create the counterparty from. Surface the IČO/DIČ (the
  // dedup keys) so a reviewer verifies the field that BINDS the partner, not just the name.
  const cp = isRecord(input["counterparty"]) ? input["counterparty"] : {}
  return {
    counterpartyName,
    counterpartyIco: asString(cp["ico"]),
    counterpartyDic: asString(cp["dic"]),
    caseDesignation: null,
    caseDescription: null,
    documentNumber: null,
    obligation: null,
    date: asString(input["occurredAt"]),
    totalAmount: null,
    currency: null,
  }
}

/** Read the `openObligation` directive off a held `createAccountingPosting` payload, or null. */
function obligationFromPosting(
  input: Record<string, unknown>,
): HeldWriteObligation | null {
  const o = input["openObligation"]
  if (!isRecord(o)) return null
  const saldoAccountNumber = asString(o["saldoAccountNumber"])
  const direction = o["direction"]
  if (
    !saldoAccountNumber ||
    (direction !== "RECEIVABLE" && direction !== "PAYABLE")
  ) {
    return null
  }
  return {
    saldoAccountNumber,
    direction,
    issueDate: asString(o["issueDate"]),
    dueDate: asString(o["dueDate"]),
    variableSymbol: asString(o["variableSymbol"]),
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
    counterpartyIco: null,
    counterpartyDic: null,
    caseDesignation: null,
    caseDescription: null,
    documentNumber: null,
    obligation: null,
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
    counterpartyIco: null,
    counterpartyDic: null,
    caseDesignation: null,
    caseDescription: null,
    documentNumber: null,
    obligation: obligationFromPosting(input),
    date: asString(entry["postingDate"]),
    totalAmount: lines.length > 0 ? toDecimal(total) : null,
    // Postings settle in the accounting currency (CZK) — no currencyCode on the payload.
    currency: "CZK",
  }
}

// ---------------------------------------------------------------------------
// Tier-3 register-card creators + generic fallback — a labeled detail section so
// createAsset / createDepreciationPlan / createInventoryCount (and any future
// op) render every public field instead of an all-null header (audit docs-P1).
// ---------------------------------------------------------------------------

const ASSET_CATEGORY_LABELS: Record<string, string> = {
  INTANGIBLE: "dlouhodobý nehmotný majetek",
  TANGIBLE_DEPRECIABLE: "hmotný odpisovaný majetek",
  TANGIBLE_NON_DEPRECIABLE: "hmotný neodpisovaný majetek",
}

const DEPRECIATION_METHOD_LABELS: Record<string, string> = {
  STRAIGHT_LINE: "rovnoměrné odpisy",
  PERFORMANCE: "výkonové odpisy",
  DECLINING: "zrychlené odpisy",
}

/** Append a `{label, value}` row only when the payload field is present + non-empty. */
function pushDetail(
  rows: HeldWriteDetailRow[],
  label: string,
  value: unknown,
): void {
  if (value === null || value === undefined || value === "") return
  rows.push({ label, value: String(value) })
}

/** A document-less register card's header: a description + date + amount, no counterparty. */
function headerFromRegisterCard(
  description: string | null,
  date: string | null,
  totalAmount: string | null,
): HeldWriteHeader {
  return {
    counterpartyName: null,
    counterpartyIco: null,
    counterpartyDic: null,
    caseDesignation: null,
    caseDescription: description,
    documentNumber: null,
    obligation: null,
    date,
    totalAmount,
    currency: totalAmount ? "CZK" : null,
  }
}

function detailsFromAsset(
  input: Record<string, unknown>,
): HeldWriteDetailRow[] {
  const rows: HeldWriteDetailRow[] = []
  const category = asString(input["category"])
  pushDetail(
    rows,
    "Kategorie",
    category ? (ASSET_CATEGORY_LABELS[category] ?? category) : null,
  )
  pushDetail(rows, "Účet", asString(input["accountNumber"]))
  pushDetail(rows, "Datum zařazení", asString(input["commissioningDate"]))
  pushDetail(rows, "Datum pořízení", asString(input["acquisitionDate"]))
  pushDetail(rows, "Číselná řada", asString(input["seriesId"]))
  pushDetail(rows, "Kód směrnice", asString(input["directiveCode"]))
  pushDetail(rows, "Umístění", asString(input["location"]))
  return rows
}

function detailsFromDepreciationPlan(
  input: Record<string, unknown>,
): HeldWriteDetailRow[] {
  const rows: HeldWriteDetailRow[] = []
  pushDetail(rows, "Majetek", asString(input["assetId"]))
  pushDetail(rows, "Datum zahájení", asString(input["startDate"]))
  pushDetail(rows, "Nákladový účet", asString(input["expenseAccountNumber"]))
  pushDetail(rows, "Účet oprávek", asString(input["accumulatedAccountNumber"]))
  const life = input["usefulLifeMonths"]
  pushDetail(
    rows,
    "Doba použitelnosti (měsíce)",
    typeof life === "number" ? life : null,
  )
  pushDetail(rows, "Zůstatková hodnota", asString(input["residualValue"]))
  pushDetail(rows, "Nahrazuje plán", asString(input["supersedesPlanId"]))
  return rows
}

function detailsFromInventoryCount(
  input: Record<string, unknown>,
): HeldWriteDetailRow[] {
  const rows: HeldWriteDetailRow[] = []
  pushDetail(rows, "Číselná řada", asString(input["seriesId"]))
  pushDetail(rows, "Datum inventury", asString(input["countDate"]))
  pushDetail(rows, "Popis", asString(input["description"]))
  return rows
}

/**
 * Generic fallback — a read-only key/value dump of the gate-envelope-stripped
 * payload, so an unmapped future gated op is NEVER rendered blind. Nested values
 * are JSON-stringified; the gate envelope (confidence/rationale/…) is peeled
 * first (it is never domain data the reviewer judges).
 */
function detailsFromUnknown(
  input: Record<string, unknown>,
): HeldWriteDetailRow[] {
  const stripped = stripGateEnvelope(input)
  return Object.entries(stripped).map(([label, value]) => ({
    label,
    value:
      value === null || value === undefined
        ? "—"
        : typeof value === "object"
          ? JSON.stringify(value)
          : String(value),
  }))
}

/**
 * Shape ONE held-write row into its review view-model: document header,
 * per-rate VAT summary, an MD/D posting preview, why-held reasons, and the
 * rationale. `conversationId` is carried through untouched so callers can
 * group sibling writes for the same účetní případ (see
 * `groupHeldWritesByCase`). `chartAccounts` is optional and used ONLY to
 * label an account number/id for display in the MD/D preview — the page
 * fetches it once (`fetchChartAccounts`) and passes it to every row.
 */
export function buildHeldWriteViewModel(
  row: HeldWriteReviewSource,
  chartAccounts: ChartAccountLookup[] = [],
): HeldWriteViewModel {
  const input = isRecord(row.input_json) ? row.input_json : {}

  let header: HeldWriteHeader
  let vatSummary: HeldWriteVatSummaryRow[] = []
  let postingLines: HeldWritePostingLineRow[] = []
  let postingKind: "double" | "monetary" | null = null
  let mddPreview: MddPreview | null = null
  let details: HeldWriteDetailRow[] = []
  let detailsTitle: string | null = null

  switch (row.tool_name) {
    case "captureAccountingDocument": {
      const partials = capturePartials(input)
      header = headerFromCapture(input, partials, row.counterparty_name)
      vatSummary = vatSummaryFromPartials(partials)
      mddPreview = mddPreviewFromCapture(input, partials, chartAccounts)
      break
    }
    case "createAccountingPosting":
      header = headerFromPosting(input, row.counterparty_name)
      postingLines = postingLinesFromInput(input)
      postingKind = input["kind"] === "monetary" ? "monetary" : "double"
      mddPreview = mddPreviewFromPosting(input, chartAccounts)
      break
    // Tier-3 register-card creators — a document-less header (name/amount/date)
    // + a labeled detail section listing every remaining public field, so the
    // reviewer can judge the newest ops instead of an all-null header.
    case "createAsset":
      header = headerFromRegisterCard(
        asString(input["name"]),
        asString(input["commissioningDate"]),
        asString(input["acquisitionCost"]),
      )
      details = detailsFromAsset(input)
      detailsTitle = "Detaily karty majetku"
      break
    case "createDepreciationPlan": {
      const method = asString(input["method"])
      header = headerFromRegisterCard(
        method
          ? `Odpisový plán — ${DEPRECIATION_METHOD_LABELS[method] ?? method}`
          : "Odpisový plán",
        asString(input["startDate"]),
        asString(input["monthlyAmount"]),
      )
      details = detailsFromDepreciationPlan(input)
      detailsTitle = "Detaily odpisového plánu"
      break
    }
    case "createInventoryCount":
      header = headerFromRegisterCard(
        asString(input["description"]) ?? "Inventurní soupis",
        asString(input["countDate"]),
        null,
      )
      details = detailsFromInventoryCount(input)
      detailsTitle = "Detaily inventurního soupisu"
      break
    case "createAccountingEvent":
      header = headerFromEvent(input, row.counterparty_name)
      break
    default:
      // Any unmapped future op renders a read-only key/value dump (envelope
      // peeled) — never blind.
      header = headerFromEvent(input, row.counterparty_name)
      details = detailsFromUnknown(input)
      detailsTitle = "Nestrukturovaný náhled"
      break
  }

  // Server-resolved case/document identity (LEFT JOINs in fetchHeldWrites) — the
  // supplier text and doklad/case Označení a raw payload can't carry pre-apply.
  // caseDescription falls back to the tool-shaped header value (the register-card
  // name) when no event row resolves — for event/capture/posting that value is
  // null, so this stays behavior-preserving for them.
  header = {
    ...header,
    caseDesignation: row.case_designation ?? null,
    caseDescription: row.case_description ?? header.caseDescription,
    documentNumber: header.documentNumber ?? row.document_designation ?? null,
  }

  return {
    id: row.id,
    toolName: row.tool_name,
    conversationId: row.conversation_id,
    header,
    details,
    detailsTitle,
    vatSummary,
    holdReasons: holdReasonsFrom(row.output_json),
    rationale: row.rationale,
    postingLines,
    postingKind,
    mddPreview,
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
