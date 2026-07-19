/**
 * Shim — the real implementations moved out of the old route tree:
 *   pure date helpers        -> `@workspace/shared/date`
 *   obligation status/grouping -> `@workspace/accounting/obligations`
 *
 * Kept as a thin re-export so the remaining in-tree closing consumers need no
 * edits; this whole subtree is deleted at the org-rebuild flip.
 */
export { formatIsoDate, monthGroupLabel } from "@workspace/shared/date"
export {
  deriveObligationStatus,
  groupByMonth,
  type ClosingObligationStatus,
  type ClosingObligationsResult,
  type ObligationWithStatus,
} from "@workspace/accounting/obligations"
