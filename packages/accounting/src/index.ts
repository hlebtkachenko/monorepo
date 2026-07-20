/**
 * @workspace/accounting — v2 domain layer for the CZ accounting records system.
 *
 * Capture (all regimes) → posting (double-entry vs monetary by the period's
 * regime) → read-model-backed books → period output. All operations run through
 * @workspace/db's withOrganization helper (organization-scoped, FORCE RLS). The
 * org IS the účetní jednotka (no separate unit). Money is exact decimal in SQL;
 * no JS float (R13). English schema (v2); see RENAME-TRACKER for CZ↔EN.
 */

export * from "./types"

// Shared helpers
export {
  allocateNumber,
  formatDesignation,
  previewNextNumber,
  type AllocatedNumber,
} from "./number-series"
export { resolveAccountId, resolveAccountIds } from "./accounts"

// Typy dokladů + Dokladové řady config backend (the Lists-layer single source for
// doklad-type/série config — every future Doklady page + table reads here)
export {
  DOCUMENT_CATEGORIES,
  DOCUMENT_SERIES_CATEGORIES,
  DOCUMENT_KINDS_BY_CATEGORY,
  documentKindsFor,
  listDocumentCategories,
  listDocumentTypes,
  getDocumentType,
  listDocumentSeries,
  getDocumentSeries,
  upsertDocumentType,
  setPrimaryDocumentType,
  setDocumentTypeActive,
  upsertDocumentSeries,
  upsertNumberSeriesPeriod,
  deleteNumberSeriesPeriod,
  type DocumentTypeRow,
  type DocumentSeriesRow,
  type NumberSeriesPeriodRow,
  type UpsertDocumentTypeInput,
  type UpsertDocumentSeriesInput,
} from "./document-type"

// Chart of accounts + Účetní osnova + prebuilt-template reads (the Lists-layer single source)
export {
  listAccounts,
  listDirectiveYear,
  listChartTemplates,
  listChartTemplateAccounts,
  findChartId,
  type ChartAccountRow,
  type DirectiveYearRow,
  type ChartTemplateRow,
  type ChartTemplateAccountRow,
} from "./chart-of-accounts"

// Master-data / setup
export {
  createPeriod,
  createVatStatus,
  createTaxProfile,
  createNumberSeries,
  backfillDefaultNumberSeries,
  createChart,
  seedChartFromDirectives,
  seedChartFromTemplate,
  resolveFrameworkYear,
  DEFAULT_OPEN_ITEM_ACCOUNTS,
  createAccount,
  createCounterparty,
  createCategory,
  createAsset,
  createDepreciationPlan,
  createInventoryCount,
  recordSignature,
  type AssetInput,
  type DepreciationPlanInput,
  type InventoryCountInput,
} from "./setup"
export {
  DEFAULT_NUMBER_SERIES,
  DEFAULT_NUMBER_SERIES_CODES,
  defaultSeriesCategory,
} from "./number-series-defaults"

// Capture (UC-1 steps 1-3)
export { createEvent, captureDocument } from "./capture"
export {
  captureAndBookIfInvoice,
  type CaptureAndBookResult,
} from "./capture-and-book"
export { resolveCounterparty } from "./counterparty"
export type { CounterpartyIdentity } from "./types"
export { mintInboxItem, type MintInboxItemInput } from "./inbox"

// Held-write replay dispatcher (shared by the API held-writes controller and the
// web approvals server action — the single source for approve-replay semantics).
export {
  executeHeldWrite,
  HELD_WRITE_STALE_MESSAGE,
} from "./held-writes/execute"

// Posting (UC-1 step 4 — Zaúčtování)
export {
  post,
  postDoubleEntry,
  postMonetary,
  getPeriodRegime,
  type PostInput,
} from "./posting/index"
export {
  postWithObligation,
  type ObligationDirective,
  type PostWithObligationInput,
  type PostWithObligationResult,
} from "./posting/post-with-obligation"

// Předkontace (account-coding templates → posting expansion)
export {
  SALES_SCENARIOS,
  PURCHASE_SCENARIOS,
  PREDKONTACE_BY_ID,
  getScenario,
  expandPartialRecord,
  expandScenarioEntries,
  postFromPredkontace,
  bookDocument,
  type AmountBasis,
  type PredkontaceEntry,
  type PredkontaceScenario,
  type ExpandInput,
  type PartialAmounts,
  type PostFromPredkontaceInput,
  type ScenarioLine,
  type BookDocumentInput,
  type BookedDocument,
} from "./predkontace/index"

// FX engine
export {
  periodFxPolicy,
  postFxSettlement,
  revalueOpenItemFx,
  type FxSettlementInput,
  type FxRevaluationInput,
  resolveFxRate,
  effectiveRate,
  convertAmount,
  convertAmountAt,
  FxRateNotFoundError,
  type ResolvedFxRate,
  type FxRateQuery,
} from "./fx/index"

// Saldokonto (open items)
export {
  openItem,
  openObligation,
  settleOpenItem,
  openItemsForCounterparty,
  unsettledOpenItems,
  saldoPerPartner,
  type OpenItemInput,
  type OpenItemRow,
  type SettleInput,
  type SaldoPerPartnerRow,
} from "./saldokonto"

// Books (UC-2 — read-model consumers)
export {
  journal,
  generalLedger,
  accountBalance,
  monetaryJournal,
  monetarySummary,
  type JournalRow,
  type LedgerAccountRow,
  type AccountBalanceRow,
  type MonetaryJournalRow,
  type MonetarySummaryRow,
} from "./books"

// Period lifecycle (R12)
export {
  closeResult,
  copyChartForward,
  openNextPeriod,
  rollForwardPeriod,
  type CloseResultInput,
  type OpenNextPeriodInput,
  type OpenNextPeriodResult,
  type RollForwardInput,
  type RollForwardResult,
} from "./period"
export {
  assessPeriodCloseReadiness,
  PeriodCloseBlockedError,
  type CloseCheckSeverity,
  type CloseCheckStatus,
  type PeriodCloseCheck,
  type PeriodCloseCheckCode,
  type PeriodCloseReadiness,
  type PeriodCloseReference,
} from "./close-readiness"

// Corrections (R8)
export { reverse, type ReverseInput } from "./corrections"

// Decision layer (the source-of-truth "brain": raw facts → posting decision)
export {
  classifyEvent,
  classifyCashMovement,
  DEFAULT_ASSET_THRESHOLD,
  SECTION_92_COMMODITY_CODES,
  type EconomicEvent,
  type PostingDecision,
  type SupplyKind,
  type VatJurisdiction,
  type Section92CommodityCode,
  type CashMovement,
  type CashDecision,
} from "./classify"

// Booking-template match (M2.1, §I9 amendment) — pure decision over a
// workspace's CONFIRMED booking_template rows (migration 0055)
export {
  matchBookingTemplate,
  type BookingSignature,
  type ConfirmedBookingTemplate,
} from "./booking-template"

// Časové rozlišení (accruals / deferrals — 381/383/384/385, §3/1 matching)
export {
  postAccrual,
  prorataByDays,
  type AccrualInput,
  type AccrualKind,
} from "./accruals"

// Fixed-asset lifecycle (pořízení 042 → zařazení 022 → vyřazení 541/641)
export { acquireAsset, commissionAsset, disposeAsset } from "./asset-lifecycle"

// Zálohy s daní (§37a — daňový doklad k záloze + vyúčtování s odpočtem zálohy)
export { postAdvanceReceived, settleAdvanceOnFinalInvoice } from "./advances"

// Daňové odpisy (tax depreciation §30-§32) + účetní-vs-daňové adjustment for DPPO
export {
  straightLineTaxDepreciation,
  acceleratedTaxDepreciation,
  taxDepreciationSchedule,
  bookVsTaxAdjustment,
  GROUP_LIFE_YEARS,
  type DepreciationGroup,
  type TaxDepreciationMethod,
} from "./depreciation"

// Supporting postings (UC-4)
export {
  generateDepreciation,
  recordInventoryDifference,
  type DepreciationInput,
  type InventoryDifferenceInput,
} from "./supporting"

// Auto-driven depreciation (UC-4) — plan+asset → monthly odpisy; §23/3 book-vs-tax → DPPO
export {
  runDepreciationForPeriod,
  bookVsTaxForAsset,
  type RunDepreciationInput,
  type RunDepreciationResult,
  type BookVsTaxResult,
} from "./depreciation-run"

// Invariants (R5 / R6 / R11 + drift)
export {
  unpostedCases,
  unlinkedInvoiceLines,
  reconcileAnalytics,
  reconcileReadModel,
  findUnbalancedPostings,
  traceAccount,
  traceEvent,
  type UnpostedCase,
  type UnlinkedInvoiceLine,
  type AnalyticalReconcile,
  type ReadModelDrift,
  type UnbalancedPosting,
  type AccountTraceRow,
  type CasePostingRow,
} from "./invariants"

// Output (UC-3)
export {
  generateOutput,
  buildZaverka,
  buildPrehledy,
  buildDpfo,
  buildDppo,
  loadDppoAdjustments,
  saveDppoAdjustments,
  buildDph,
  buildKontrolniHlaseni,
  buildSouhrnneHlaseni,
  getVatPeriodActivity,
  getVatEvidenceCompleteness,
  computeIncomeTaxAdvances,
  NON_DEDUCTIBLE_CATALOGUE,
  KH_ROW_THRESHOLD,
  UnpostedPeriodError,
  type GeneratedOutput,
  type OutputFigures,
  type Zaverka,
  type ZaverkaTotals,
  type StatementLineRow,
  type Prehledy,
  type Dpfo,
  type Dppo,
  type DppoInput,
  type DppoAdjustmentKey,
  type DppoAdjustmentEntry,
  type DppoAdjustmentSaveInput,
  resolveDppoRate,
  type DppoRateResolution,
  type DppoTaxpayerCategory,
  type AdjustmentProvenance,
  type AnnualArtifactCompleteness,
  type ProvenancedDecimal,
  type Dph,
  type DphRows,
  type KontrolniHlaseniTotals,
  type VatEvidenceCompleteness,
  type KontrolniHlaseni,
  type KhRow,
  type KhAggregate,
  type SouhrnneHlaseni,
  type ShRow,
  buildStatementLayout,
  type StatementLayout,
  type LayoutLine,
  type StatementRozsah,
  type StatementUnit,
} from "./output/index"

// Obligation + deadline engine (monthly/quarterly VAT + payroll; annual
// income-tax/year-end deadlines are out of scope for this unit — see
// obligations/obligations.ts). `VatFilingPeriod`, `VatRegime`, and
// `PersonType` are NOT re-exported here — they are omitted because
// `export * from "./types"` above already exports the identical ones, so
// re-exporting them here would be redundant.
export {
  czechHolidays,
  shiftToBusinessDay,
  nthOfNextMonth,
  vatMonthlyDeadline,
  payrollMonthlyDeadline,
  specialRateWithholdingDeadline,
  PAYROLL_THRESHOLD_RULES,
  PAYROLL_DEADLINE_RULES,
  payrollDeadlineForMonth,
  payrollDeadlineRuleForMonth,
  payrollThresholdRuleForMonth,
  evaluateAgreementInsuranceParticipation,
  resolveEffectiveTimeline,
  singleEffectiveValue,
  deriveObligationPresentationStatus,
  computeTimelineObligations,
  statutoryVatEnvelope,
  computeObligations,
  computePayrollObligations,
  type EffectiveFact,
  type EffectiveSegment,
  type ApplicabilityDecision,
  type FilingRecord,
  type ObligationPresentationStatus,
  type ScheduleCandidate,
  type PayrollProfileValue,
  type LegalSourceMetadata,
  type PayrollThresholdRule,
  type PayrollDeadlineRule,
  type PayrollObligationKind,
  type AgreementKind,
  type AgreementInsuranceParticipation,
  type ProfileIssue,
  type ProfileIssueCode,
  type TimelineObligationResult,
  type VatProfileValue,
  type ObligationCategory,
  type ObligationKind,
  type ObligationInput,
  type Obligation,
  type VatPeriodActivity,
} from "./obligations/index"
