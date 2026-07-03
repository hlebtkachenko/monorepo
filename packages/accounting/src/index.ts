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
  type AllocatedNumber,
} from "./number-series"
export { resolveAccountId, resolveAccountIds } from "./accounts"

// Master-data / setup
export {
  createPeriod,
  createNumberSeries,
  createChart,
  createAccount,
  createCounterparty,
  createCategory,
  createAsset,
  createDepreciationPlan,
  createInventoryCount,
  recordSignature,
} from "./setup"

// Capture (UC-1 steps 1-3)
export { createEvent, captureDocument } from "./capture"

// Posting (UC-1 step 4 — Zaúčtování)
export {
  post,
  postDoubleEntry,
  postMonetary,
  getPeriodRegime,
  type PostInput,
} from "./posting/index"

// Předkontace (account-coding templates → posting expansion)
export {
  SALES_SCENARIOS,
  PURCHASE_SCENARIOS,
  PREDKONTACE_BY_ID,
  getScenario,
  expandPartialRecord,
  postFromPredkontace,
  type AmountBasis,
  type PredkontaceEntry,
  type PredkontaceScenario,
  type ExpandInput,
  type PostFromPredkontaceInput,
} from "./predkontace/index"

// FX engine
export {
  periodFxPolicy,
  postFxSettlement,
  revalueOpenItemFx,
  type FxSettlementInput,
  type FxRevaluationInput,
} from "./fx/index"

// Saldokonto (open items)
export {
  openItem,
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
  monetaryJournal,
  monetarySummary,
  type JournalRow,
  type LedgerAccountRow,
  type MonetaryJournalRow,
  type MonetarySummaryRow,
} from "./books"

// Period lifecycle (R12)
export {
  closePeriod,
  closeResult,
  copyChartForward,
  openNextPeriod,
  type CloseResultInput,
  type OpenNextPeriodInput,
  type OpenNextPeriodResult,
} from "./period"

// Corrections (R8)
export { reverse, type ReverseInput } from "./corrections"

// Decision layer (the source-of-truth "brain": raw facts → posting decision)
export {
  classifyEvent,
  classifyCashMovement,
  DEFAULT_ASSET_THRESHOLD,
  type EconomicEvent,
  type PostingDecision,
  type SupplyKind,
  type VatJurisdiction,
  type CashMovement,
  type CashDecision,
} from "./classify"

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
  reconcileAnalytics,
  reconcileReadModel,
  findUnbalancedPostings,
  traceAccount,
  traceEvent,
  type UnpostedCase,
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
  buildDph,
  buildKontrolniHlaseni,
  buildSouhrnneHlaseni,
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
  type Dph,
  type DphRows,
  type KontrolniHlaseniTotals,
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
