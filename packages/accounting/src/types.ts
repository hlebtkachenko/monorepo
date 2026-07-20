/**
 * Domain DTOs for the v2 accounting records system (English schema).
 *
 * Enum unions are derived from the Drizzle pgEnums (single source of truth, in
 * sync with the SQL). `regime` is a reference TABLE keyed by a text code (not a
 * pgEnum), so Regime is a literal union here.
 *
 * Money is represented as `Decimal` (a decimal string, e.g. "121.00") — never a
 * JS number. All money arithmetic happens in SQL; the TS layer only transports
 * decimal strings to/from numeric(19,4) columns. See src/sql.ts for the
 * rationale.
 */

import type {
  Section92CommodityCode,
  SupplyKind,
  VatJurisdiction,
} from "./classify"
import type {
  periodStatus,
  summaryRecordType,
  vatMode,
  fxRateKind,
  debitCredit,
  postingKind,
  correctionType,
  monetaryLocation,
  monetaryDirection,
  categoryType,
  accountNature,
  signatureRole,
  openItemDirection,
  periodOutputType,
  assetCategory,
  depreciationMethod,
  vatFilingPeriod,
  personType,
  documentCategory,
  documentKind,
} from "@workspace/db/schema"

// --- enum unions -----------------------------------------------------------

/** The three bookkeeping regimes (regime.code reference table, §13/§13b/§7b). */
export type Regime = "DOUBLE_ENTRY" | "SINGLE_ENTRY" | "TAX_RECORDS"
/** vat_regime.code reference table (§6/§6f/§97 ZDPH). */
export type VatRegime = "NON_PAYER" | "PAYER" | "IDENTIFIED_PERSON"
export type VatFilingPeriod = (typeof vatFilingPeriod.enumValues)[number]
/** organization.person_type (generated column, §13/§13b legal vs. natural person). */
export type PersonType = (typeof personType.enumValues)[number]
export type PeriodStatus = (typeof periodStatus.enumValues)[number]
export type SummaryRecordType = (typeof summaryRecordType.enumValues)[number]
/**
 * The doklad types that carry a předkontace + a saldokonto obligation — the
 * booking-eligible invoices. Cash / bank / internal / batch vouchers capture
 * only, so the single source of truth for "is this bookable as an invoice"
 * lives here (used by captureDocument's date guards + captureAndBookIfInvoice).
 */
const INVOICE_DOCUMENT_TYPES = [
  "RECEIVED_INVOICE",
  "ISSUED_INVOICE",
] as const satisfies readonly SummaryRecordType[]
export function isInvoiceType(type: SummaryRecordType): boolean {
  return (INVOICE_DOCUMENT_TYPES as readonly SummaryRecordType[]).includes(type)
}
export type VatMode = (typeof vatMode.enumValues)[number]
export type FxRateKind = (typeof fxRateKind.enumValues)[number]
export type DebitCredit = (typeof debitCredit.enumValues)[number]
export type PostingKind = (typeof postingKind.enumValues)[number]
export type CorrectionType = (typeof correctionType.enumValues)[number]
export type MonetaryLocation = (typeof monetaryLocation.enumValues)[number]
export type MonetaryDirection = (typeof monetaryDirection.enumValues)[number]
export type CategoryType = (typeof categoryType.enumValues)[number]
export type AccountNature = (typeof accountNature.enumValues)[number]
export type SignatureRole = (typeof signatureRole.enumValues)[number]
export type OpenItemDirection = (typeof openItemDirection.enumValues)[number]
export type PeriodOutputType = (typeof periodOutputType.enumValues)[number]
export type AssetCategory = (typeof assetCategory.enumValues)[number]
export type DepreciationMethod = (typeof depreciationMethod.enumValues)[number]
/** Config-facing doklad bucket (Typy dokladů / Dokladové řady). Superset of the booked SummaryRecordType. */
export type DocumentCategory = (typeof documentCategory.enumValues)[number]
/** Druh — the per-category doklad kind; which kinds are valid per category lives in DOCUMENT_KINDS_BY_CATEGORY. */
export type DocumentKind = (typeof documentKind.enumValues)[number]

/** Exact decimal amount as a string (e.g. "121.00"). Never a JS number (R13). */
export type Decimal = string

/**
 * Organization + workspace scope passed to every domain operation.
 *
 * `organizationId` is the RLS anchor (app.organization_id GUC); `workspaceId`
 * is the app.workspace_id GUC — both are set by withOrganization, and the
 * workspace id is required for the workspace-shared counterparty / event /
 * open_item composite FKs.
 */
export interface OrgCtx {
  organizationId: string
  workspaceId: string
  /**
   * Provenance stamp threaded onto every row this operation INSERTs (the
   * `inbox_id` column). Set only on the approve replay of a gated write, from the
   * `inbox_item` minted for that landed proposal — so any agent-originated row is
   * filterable ("Created by Agent") via `inbox_id IS NOT NULL`. Absent (undefined)
   * for a human-driven write ⇒ every insert stamps NULL. Append-only tables ⇒
   * stamped at INSERT, never backfilled.
   */
  inboxId?: string | null
}

/** A statutory calendar month or quarter, inclusive at both ends. */
export interface StatutoryPeriod {
  from: string
  to: string
}

/**
 * The two explicit evidence boundaries supported by VAT read models.
 * Statutory outputs use FILING_PERIOD and may cross accounting periods.
 * ACCOUNTING_PERIOD remains available for the period-scoped public read model.
 */
export type VatEvidenceScope =
  | { kind: "ACCOUNTING_PERIOD"; periodId: string }
  | { kind: "FILING_PERIOD"; period: StatutoryPeriod }

// --- capture (UC-1 steps 1-3, all regimes) ---------------------------------

/** An účetní případ (the economic fact, §6/1). number_series allocates the Označení. */
/** A partner identity to find-or-create (resolveCounterparty), when no id is known. */
export interface CounterpartyIdentity {
  name?: string | null
  /** IČO — CZ registration number (8 digits). Primary match key. */
  ico?: string | null
  /** DIČ / EU VAT id, with country prefix (e.g. "CZ12345678"). */
  dic?: string | null
  /** ISO 3166-1 alpha-2 member state. */
  countryCode?: string | null
}

export interface EventInput {
  /** The účetní období this case belongs to (occurred_on ∈ period). */
  periodId: string
  /** number_series with entity_type = EVENT. */
  seriesId: string
  /** OUR side (a counterparty row); null for an internal event. */
  partyId?: string | null
  /** THEIR side (a counterparty row) — takes precedence over {@link counterparty}. */
  counterpartyId?: string | null
  /**
   * THEIR side by IDENTITY — resolved (find-or-create) to a counterparty row inside
   * createEvent when counterpartyId is absent. The derive path passes this so the
   * booked invoice opens its saldokonto obligation against the right partner.
   */
  counterparty?: CounterpartyIdentity | null
  description: string
  content?: string | null
  /** okamžik uskutečnění (§11/1e) — ISO date/timestamp; must fall in the period. */
  occurredAt: string
  /** Czech legal calendar date. Omit only for legacy callers; derived in Europe/Prague. */
  occurredOn?: string
  /** osoba odpovědná za případ (§11/1f, R10) — app_user id. */
  responsibleUserId: string
}

/** A dílčí účetní záznam — the money level (§11/1c). Posting EXPANDS it into MD/D lines. */
export interface PartialRecordInput {
  quantity?: Decimal | null
  measureUnit?: string | null
  unitPrice?: Decimal | null
  /** základ daně / Suma celkem. */
  baseAmount: Decimal
  /** 0/12/21…; null for OUTSIDE_VAT. */
  vatRate?: Decimal | null
  /** DRIVES posting (STANDARD / REVERSE_CHARGE / EXEMPT / OUTSIDE_VAT / IMPORT). */
  vatMode: VatMode
  /**
   * Place-of-supply regime (ZDPH §16/§92/§102/§108) — DOMESTIC/REVERSE_CHARGE/
   * EU/IMPORT/EXEMPT/OUTSIDE_VAT/SECTION_108. Splits the self-assessed received
   * lines that all capture as REVERSE_CHARGE: 'EU' → ř.3/4 (§16 goods) or ř.5/6
   * (§9(1) service); 'SECTION_108' → ř.12/13 (§108 residual — place of supply
   * CZ, supplier not established); anything else → ř.10/11 (domestic §92 PDP).
   * Also drives the §102 souhrnné hlášení. Omit → NULL (legacy: a REVERSE_CHARGE
   * receipt defaults to domestic ř.10/11).
   */
  vatJurisdiction?: VatJurisdiction | null
  /**
   * Kind of supply (ZDPH §64/§9) — GOODS/MATERIAL/SERVICES/UTILITY/RENT/
   * INSURANCE/ASSET/ADVANCE/CREDIT_NOTE/OTHER. Drives the §102 souhrnné hlášení
   * kód plnění (SERVICES → 3 service §9/1; else → 0 goods §64). Omit → NULL
   * (legacy/undistinguished → kód 0).
   */
  supplyKind?: SupplyKind | null
  /**
   * §92 kód předmětu plnění for a DOMESTIC reverse-charge supply — "1" zlato
   * §92b / "3" nemovitost §92d / "4" stavební-montážní §92e / "5" příloha 5
   * §92c. Drives the kontrolní hlášení A.1/B.1 kód předmětu plnění. Omit → NULL
   * (not a §92 domestic PDP row → no kód). Distinct from supplyKind (that is the
   * souhrnné hlášení kód 0/3).
   */
  commodityCode?: Section92CommodityCode | null
  /** false → VAT folds into cost. Defaults true. */
  vatDeductible?: boolean
  /** daňový doklad k záloze (§37a). Defaults false. */
  advanceSettlement?: boolean
  /** daň; 0 on reverse-charge/exempt docs. Defaults "0". */
  vatAmount?: Decimal
  /** transaction currency (ISO 4217). */
  currencyCode: string
  /** DAILY | REAL | FIXED — required iff currency <> accounting currency. */
  fxRateKind?: FxRateKind | null
  /** to accounting currency; required iff currency <> accounting currency. */
  fxRate?: Decimal | null
  /** §4/5 ČNB rate for the VAT base when it differs from fxRate. */
  vatFxRate?: Decimal | null
  /**
   * Frozen base in měna účetnictví. Omit to let the FX helper derive it (= base
   * for the single-currency case, base × fxRate for the foreign-currency case).
   */
  baseInAccountingCurrency?: Decimal
  /** Frozen VAT in měna účetnictví. Omit to let the FX helper derive it. */
  vatInAccountingCurrency?: Decimal
}

/** One jednotlivý účetní záznam (line) — links a case to the voucher; carries the money. */
export interface IndividualRecordInput {
  /** The accounting_event (case) this line documents. */
  eventId: string
  description?: string | null
  partials: PartialRecordInput[]
}

/** A souhrnný účetní záznam = voucher/doklad header (§11). number_series allocates Označení. */
export interface DocumentInput {
  /** The účetní období this voucher books into. */
  periodId: string
  /** number_series with entity_type = DOCUMENT. */
  seriesId: string
  type: SummaryRecordType
  /** okamžik vyhotovení (§11/1d). */
  issuedAt: string
  /** DUZP/DPPD for VAT reporting. Missing means the legal date is unresolved. */
  taxPointDate?: string | null
  /** Date the recipient obtained the document. Required to prove input-VAT eligibility. */
  receivedDate?: string | null
  /** §37 doc-total rounding → 548/648 at posting. Defaults "0". */
  roundingAmount?: Decimal
  lines: IndividualRecordInput[]
}

export interface CapturedLine {
  individualRecordId: string
  partialRecordIds: string[]
}

export interface CapturedDocument {
  summaryRecordId: string
  designation: string
  sequenceNumber: number
  lines: CapturedLine[]
}

export interface CapturedEvent {
  eventId: string
  designation: string
  sequenceNumber: number
}

// --- posting (UC-1 step 4 — Zaúčtování §6/2) -------------------------------

export interface PostingBase {
  periodId: string
  /** doklad_id (R2) — the voucher this posting books from. */
  summaryRecordId: string
  /** pripad_id (R2) — the case being booked. */
  accountingEventId: string
  /** datum (§5.2) — deník order + period membership. */
  postingDate: string
  /** odpovědná osoba (R10) — app_user id. */
  responsibleUserId: string
  /** druh; defaults to SIMPLE for a 2-line posting, COMPOUND otherwise. */
  postingKind?: PostingKind
  /** Correction linkage (R8/§35) — both set together or both omitted. */
  correctsPostingId?: string | null
  correctionType?: CorrectionType | null
  /** Set when generated by a depreciation plan (UC-4). */
  depreciationPlanId?: string | null
  /** Set when generated from an inventory difference (UC-4). */
  inventoryCountId?: string | null
  /** 701 opening posting (B2) — excluded from turnover, sets opening_balance. */
  isOpening?: boolean
}

export interface DoubleEntryLineInput {
  accountId: string
  side: DebitCredit
  amount: Decimal
  /** Source dílčí (§6/2) — omitted for generated postings (701, depreciation, storno). */
  partialRecordId?: string | null
}

export interface DoubleEntryInput extends PostingBase {
  lines: DoubleEntryLineInput[]
}

export interface MonetaryLineInput {
  location: MonetaryLocation
  direction: MonetaryDirection
  isTaxRelevant: boolean
  isClearing?: boolean
  categoryId?: string | null
  taxBase?: Decimal | null
  amount: Decimal
  partialRecordId?: string | null
}

export interface MonetaryInput extends PostingBase {
  regime: Extract<Regime, "SINGLE_ENTRY" | "TAX_RECORDS">
  lines: MonetaryLineInput[]
}

export interface PostedPosting {
  postingId: string
  lineIds: string[]
}
