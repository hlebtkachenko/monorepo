/**
 * @workspace/accounting — domain layer for the CZ accounting records system.
 *
 * Capture core (all regimes) → posting (double-entry vs cash-book by regime) →
 * books (views) → period output. All operations run through @workspace/db's
 * withOrganization helper (organization-scoped, FORCE RLS). Money is exact
 * decimal in SQL; no JS float (R13).
 */

export * from "./types"

// Master data / setup
export {
  createUnit,
  createPeriod,
  createChart,
  createAccount,
  createCounterparty,
  createCategory,
  createAsset,
  createDepreciationPlan,
  createInventory,
  recordSignature,
} from "./setup"

// Capture (UC-1 steps 1-3)
export { createCase, captureDocument } from "./capture"

// Posting (UC-1 step 4 — Zaúčtování)
export {
  post,
  postDoubleEntry,
  postCashEntry,
  getUnitRegime,
  type PostInput,
} from "./posting/index"

// Books (UC-2)
export {
  denik,
  hlavniKniha,
  knihaAnalytickych,
  knihaPodrozvahovych,
  penezniDenik,
  type DenikRow,
  type UcetBalanceRow,
  type PenezniDenikRow,
} from "./books"

// Period lifecycle (R12)
export {
  closePeriod,
  openNextPeriod,
  type OpenNextPeriodInput,
  type OpenNextPeriodResult,
} from "./period"

// Corrections (R8)
export { stornoEntry, type StornoInput } from "./corrections"

// Supporting postings (UC-4)
export {
  generateDepreciation,
  recordInventoryDifference,
  type DepreciationInput,
  type InventoryDifferenceInput,
} from "./supporting"

// Invariants (R5 reconcile, R6 gate, R11 trace)
export {
  unpostedCases,
  reconcileAnalytics,
  traceAccount,
  tracePripad,
  type UnpostedCase,
  type AnalyticalReconcile,
  type TraceRow,
  type CasePostingRow,
} from "./invariants"

// Output (UC-3)
export {
  generateOutput,
  buildZaverka,
  buildPrehledy,
  buildDpfo,
  UnpostedPeriodError,
  type GeneratedOutput,
  type OutputFigures,
  type Zaverka,
  type ZaverkaAccount,
  type Prehledy,
  type Dpfo,
} from "./output/index"
