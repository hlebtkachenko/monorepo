/**
 * Posting DECISION layer — the source-of-truth "brain".
 *
 * Given the RAW economic facts of a case (who, what supply, amounts, VAT status,
 * service window, durability), this decides the complete accounting treatment —
 * which předkontace, whether to CAPITALISE (asset) vs expense, whether to DEFER
 * across periods (časové rozlišení), whether to SELF-ASSESS VAT (reverse charge),
 * the right cost/revenue account — and returns a decision with a law-cited
 * reasoning trail. The engine then executes the decision.
 *
 * This is deliberately NOT "replay a solved deník": the caller supplies facts,
 * not a chosen account. Every branch cites the statute so an advisor (or an audit)
 * can check WHY, and so the layer is the single source of truth rather than a
 * double-check of a human's answer. Deterministic + pure (no DB); the ingestion
 * layer (OCR / bank-feed → facts) is separate.
 *
 * Law frame: ZDPH 235/2004 (VAT mode/self-assessment), ZDP 586/1992 §26–§33
 * (asset threshold + depreciation), Decree 500/2002 §7/§13 + ČÚS 013/017/019
 * (capitalisation + časové rozlišení), §3/1 ZoÚ (matching principle).
 */

import type { Decimal, VatMode } from "./types"

/** The durable-asset capitalisation threshold (§26/2 ZDP hmotný majetek = 80 000 Kč;
 * účetní jednotka may set its own in its směrnice — override via `assetThreshold`). */
export const DEFAULT_ASSET_THRESHOLD = "80000"

export type SupplyKind =
  | "GOODS"
  | "MATERIAL"
  | "SERVICES"
  | "UTILITY"
  | "RENT"
  | "INSURANCE"
  | "ASSET" // durable — candidate for capitalisation
  | "ADVANCE" // záloha §37a
  | "CREDIT_NOTE" // dobropis §42
  | "OTHER"

export type VatJurisdiction =
  | "DOMESTIC"
  | "REVERSE_CHARGE" // §92a-92e domestic PDP (e.g. stavební práce)
  | "EU" // intra-community
  | "IMPORT" // 3rd country
  | "EXEMPT" // §51/§70
  | "OUTSIDE_VAT" // neplátce supplier / mimo předmět

export interface EconomicEvent {
  direction: "RECEIVED" | "ISSUED" // FP (purchase) vs FV (sale)
  supplyKind: SupplyKind
  jurisdiction: VatJurisdiction
  base: Decimal
  vat: Decimal
  /** stated rate; for reverse charge the underlying rate to self-assess at. */
  vatRate?: string | null
  currency: string
  fxRate?: string | null
  /** service window — if it crosses the period end, the future part is deferred. */
  serviceWindow?: { start: string; end: string }
  /** the accounting period end (to test the matching split). */
  periodEnd?: string
  /** durable long-term asset (tangible/intangible)? drives capitalisation. */
  durable?: boolean
  /** override the §26 threshold from the entity's směrnice. */
  assetThreshold?: Decimal
  /** acquisition account for a capitalised asset (042 DHM default; 041 DNM). */
  acquisitionAccount?: string
  /** true when totals are negative (credit note flips the sides). */
  isCreditNote?: boolean
}

export interface PostingDecision {
  /** vat_mode to stamp on the partial_record. */
  vatMode: VatMode
  /** rate to freeze (null for exempt/outside). */
  vatRate: string | null
  /** předkontace scenario id from the core catalogue. */
  scenario: string
  /** template account → tenant account remap (e.g. cost account by category). */
  accountOverrides?: Record<string, string>
  /** open-item account (311 receivable / 321 payable), or null. */
  saldoAccount: "311" | "321" | null
  /** CAPITALISE: route the net to an acquisition account (042/041) not an expense. */
  capitalise?: { acquisitionAccount: string }
  /** DEFER: after posting, move the future part to a bridge account (381/384). */
  deferral?: { bridge: "381" | "384"; reason: string }
  /** law-cited decision trail — WHY this treatment. */
  reasoning: string[]
}

/** Category → the cost account for a standard purchase (Decree 500/2002 class 5). */
const EXPENSE_ACCOUNT: Record<SupplyKind, string> = {
  MATERIAL: "501",
  GOODS: "504",
  SERVICES: "518",
  UTILITY: "502",
  RENT: "518",
  INSURANCE: "548",
  ASSET: "518", // only if below threshold (drobný majetek)
  ADVANCE: "314",
  CREDIT_NOTE: "504",
  OTHER: "548",
}

/** Revenue account for a sale (class 6). */
const REVENUE_ACCOUNT: Record<SupplyKind, string> = {
  GOODS: "604",
  MATERIAL: "604",
  SERVICES: "602",
  UTILITY: "602",
  RENT: "602",
  INSURANCE: "648",
  ASSET: "641",
  ADVANCE: "324",
  CREDIT_NOTE: "604",
  OTHER: "648",
}

function crossesPeriodEnd(ev: EconomicEvent): boolean {
  if (!ev.serviceWindow || !ev.periodEnd) return false
  return ev.serviceWindow.end > ev.periodEnd
}

/**
 * Decide the full accounting treatment for one economic event.
 */
export function classifyEvent(ev: EconomicEvent): PostingDecision {
  const reasoning: string[] = []
  const isPurchase = ev.direction === "RECEIVED"

  // --- 1. credit note (§42) — reverse-sign standard scenario ---
  if (ev.isCreditNote || ev.supplyKind === "CREDIT_NOTE") {
    reasoning.push(
      "§42 ZDPH: opravný daňový doklad (dobropis) → reverse the original supply's sides.",
    )
    return {
      vatMode: "STANDARD",
      vatRate: ev.vatRate ?? "21",
      scenario: "P-CREDIT-NOTE-STD",
      accountOverrides: { "504": EXPENSE_ACCOUNT[ev.supplyKind] ?? "504" },
      saldoAccount: null,
      reasoning,
    }
  }

  // --- 2. asset capitalisation (§26 ZDP + Decree 500/2002 §7) ---
  const threshold = ev.assetThreshold ?? DEFAULT_ASSET_THRESHOLD
  const capitalise =
    isPurchase && ev.durable === true && Number(ev.base) >= Number(threshold)
  if (isPurchase && ev.durable) {
    if (capitalise) {
      reasoning.push(
        `§26/2 ZDP + Decree 500/2002 §7: durable asset, pořizovací cena ${ev.base} ≥ ${threshold} → capitalise to 042 (pořízení DHM), depreciate; not a direct expense.`,
      )
    } else {
      reasoning.push(
        `durable but pořizovací cena ${ev.base} < ${threshold} → drobný majetek, direct expense (501/518) per the entity's směrnice.`,
      )
    }
  }

  // --- 3. VAT mode from jurisdiction ---
  const { vatMode, vatRate, scenario, note } = decideVat(ev, isPurchase)
  reasoning.push(note)

  // --- 4. account (expense or revenue), with capitalisation override ---
  const overrides: Record<string, string> = {}
  const costAccount = capitalise
    ? (ev.acquisitionAccount ?? "042")
    : EXPENSE_ACCOUNT[ev.supplyKind]
  const revenueAccount = REVENUE_ACCOUNT[ev.supplyKind]
  if (isPurchase) {
    // remap the scenario's default expense account (504 goods / 518 services / 548 outside)
    if (scenario === "P-GOODS-21" || scenario === "P-CREDIT-NOTE-STD")
      overrides["504"] = costAccount
    else if (scenario === "P-SERVICES-21" || scenario === "P-PDP")
      overrides["518"] = costAccount
    else if (scenario === "P-OUTSIDE-VAT") overrides["548"] = costAccount
    else if (scenario === "P-EXEMPT-RECEIVED") overrides["518"] = costAccount
  } else {
    // sale: remap the scenario's default revenue account to the category revenue
    if (scenario === "S-GOODS-21") overrides["604"] = revenueAccount
    else if (scenario === "S-SERVICES-21") overrides["602"] = revenueAccount
    else if (scenario === "S-EXEMPT-NO-CREDIT")
      overrides["602"] = revenueAccount
  }

  // --- 5. časové rozlišení (§3/1 matching) ---
  let deferral: PostingDecision["deferral"]
  if (crossesPeriodEnd(ev)) {
    if (isPurchase) {
      deferral = {
        bridge: "381",
        reason:
          "§3/1 ZoÚ: service window extends past the period end → defer the future part to 381 (náklady příštích období).",
      }
    } else {
      deferral = {
        bridge: "384",
        reason:
          "§3/1 ZoÚ: revenue window extends past the period end → defer the future part to 384 (výnosy příštích období).",
      }
    }
    reasoning.push(deferral.reason)
  }

  return {
    vatMode,
    vatRate,
    scenario,
    accountOverrides: Object.keys(overrides).length ? overrides : undefined,
    saldoAccount: isPurchase ? "321" : "311",
    capitalise: capitalise
      ? { acquisitionAccount: ev.acquisitionAccount ?? "042" }
      : undefined,
    deferral,
    reasoning,
  }
}

/**
 * A raw bank / cash movement (one Fio-CSV row, one pokladní pohyb) — the fact the
 * ingestion layer extracts. Direction + amount + the free-text category / message /
 * counterparty are what a bank feed actually carries; the decision layer maps them
 * to the contra účet. This is the SOURCE-OF-TRUTH join point: raw feed → decide →
 * post, no solved deník.
 */
export interface CashMovement {
  direction: "INFLOW" | "OUTFLOW"
  amount: Decimal
  /** Fio "Kategorie transakce" (e.g. "Poplatek", "Platba", "Hotovostní transakce"). */
  category?: string | null
  /** protistrana name. */
  counterpartyName?: string | null
  /** Zpráva / Poznámka free text. */
  message?: string | null
  /** true for a plátce DPH (then a taxable payment may carry VAT); nonprofits = false. */
  isVatPayer?: boolean
}

export interface CashDecision {
  /** the non-bank leg account (the bank/cash side is supplied by the poster). */
  contraAccount: string
  kind: "EXPENSE" | "REVENUE" | "TRANSFER" | "SETTLEMENT"
  /** low when the mapping fell through to a default bucket — flag for review. */
  confidence: "high" | "medium" | "low"
  reasoning: string[]
}

/** case-insensitive "does the haystack contain any needle" over category + message + counterparty. */
function mentions(m: CashMovement, ...needles: string[]): boolean {
  const hay =
    `${m.category ?? ""} ${m.message ?? ""} ${m.counterpartyName ?? ""}`.toLowerCase()
  return needles.some((n) => hay.includes(n.toLowerCase()))
}

/**
 * Decide the contra account for a bank/cash movement from its raw facts. Account
 * semantics follow the nonprofit směrná osnova (Vyhláška 504/2002 Sb.) for the
 * příspěvky classes (58 poskytnuté / 68 přijaté) and the shared class 5/6 for the
 * rest; a plátce's taxable payment keeps VAT handling to the invoice path (a bank
 * feed alone is not a daňový doklad). Keyword-driven: high confidence on a clear
 * category/message, low when it falls through to the generic bucket (flag for review).
 */
export function classifyCashMovement(m: CashMovement): CashDecision {
  const reasoning: string[] = []
  const outflow = m.direction === "OUTFLOW"

  // cash withdrawal / transfer between own accounts → peníze na cestě (261), not a P&L hit
  if (mentions(m, "výběr hotovosti", "vklad hotovosti", "převod mezi účty")) {
    reasoning.push(
      "hotovostní výběr/vklad nebo interní převod → 261 peníze na cestě (přeúčtování, ne náklad/výnos).",
    )
    return {
      contraAccount: "261",
      kind: "TRANSFER",
      confidence: "high",
      reasoning,
    }
  }

  if (outflow) {
    if (mentions(m, "poplatek", "vedení účtu", "úrok")) {
      reasoning.push(
        "bankovní poplatek / vedení účtu → 568 ostatní finanční náklady.",
      )
      return {
        contraAccount: "568",
        kind: "EXPENSE",
        confidence: "high",
        reasoning,
      }
    }
    if (mentions(m, "pojištění", "pojistné")) {
      reasoning.push(
        "pojistné → 549 ostatní provozní náklady (osvobozeno §55 ZDPH).",
      )
      return {
        contraAccount: "549",
        kind: "EXPENSE",
        confidence: "high",
        reasoning,
      }
    }
    if (mentions(m, "dar", "darovací", "příspěvek")) {
      reasoning.push(
        "poskytnutý dar / příspěvek jiné organizaci → 58 poskytnuté příspěvky (Vyhláška 504/2002).",
      )
      return {
        contraAccount: "581",
        kind: "EXPENSE",
        confidence: "medium",
        reasoning,
      }
    }
    reasoning.push(
      "nezařazený výdaj → 518 ostatní služby (default; flag pro revizi).",
    )
    return {
      contraAccount: "518",
      kind: "EXPENSE",
      confidence: "low",
      reasoning,
    }
  }

  // inflow
  if (mentions(m, "dar", "darovací", "příspěvek", "dotace")) {
    reasoning.push(
      "přijatý dar / příspěvek / dotace → 682 přijaté příspěvky (Vyhláška 504/2002).",
    )
    return {
      contraAccount: "682",
      kind: "REVENUE",
      confidence: "medium",
      reasoning,
    }
  }
  reasoning.push(
    "nezařazený příjem → 649 jiné provozní výnosy (default; flag pro revizi).",
  )
  return { contraAccount: "649", kind: "REVENUE", confidence: "low", reasoning }
}

function decideVat(
  ev: EconomicEvent,
  isPurchase: boolean,
): {
  vatMode: VatMode
  vatRate: string | null
  scenario: string
  note: string
} {
  switch (ev.jurisdiction) {
    case "REVERSE_CHARGE":
      return {
        vatMode: "REVERSE_CHARGE",
        vatRate: ev.vatRate ?? "21",
        scenario: isPurchase ? "P-PDP" : "S-PDP",
        note: "§92a-92e ZDPH: přenesená daňová povinnost → self-assess VAT on 343↔343 (buyer), no VAT to the seller.",
      }
    case "EU":
      return {
        vatMode: "REVERSE_CHARGE",
        vatRate: ev.vatRate ?? "21",
        scenario: isPurchase ? "P-EU-GOODS" : "S-EU-GOODS-DELIVERY",
        note: "§16/§64 ZDPH: intra-community acquisition/supply → acquirer self-assesses (§25); supply is zero-rated + souhrnné hlášení.",
      }
    case "IMPORT":
      return {
        vatMode: "IMPORT",
        vatRate: ev.vatRate ?? "21",
        scenario: isPurchase ? "P-IMPORT" : "S-EXPORT",
        note: "§23/§66 ZDPH: import self-assessment / export zero-rated.",
      }
    case "EXEMPT":
      return {
        vatMode: "EXEMPT",
        vatRate: null,
        scenario: isPurchase ? "P-EXEMPT-RECEIVED" : "S-EXEMPT-NO-CREDIT",
        note: "§51/§70 ZDPH: osvobozené plnění → no input/output VAT.",
      }
    case "OUTSIDE_VAT":
      return {
        vatMode: "OUTSIDE_VAT",
        vatRate: null,
        scenario: isPurchase ? "P-OUTSIDE-VAT" : "S-EXEMPT-NO-CREDIT",
        note: "supplier is a neplátce / plnění mimo předmět daně → no VAT, gross to cost.",
      }
    case "DOMESTIC":
    default: {
      const goods =
        ev.supplyKind === "GOODS" ||
        ev.supplyKind === "MATERIAL" ||
        ev.supplyKind === "ASSET"
      return {
        vatMode: "STANDARD",
        vatRate: ev.vatRate ?? "21",
        scenario: isPurchase
          ? goods
            ? "P-GOODS-21"
            : "P-SERVICES-21"
          : goods
            ? "S-GOODS-21"
            : "S-SERVICES-21",
        note: `§13/§14 ZDPH: standard domestic ${goods ? "goods" : "service"} supply at ${ev.vatRate ?? "21"} %.`,
      }
    }
  }
}
