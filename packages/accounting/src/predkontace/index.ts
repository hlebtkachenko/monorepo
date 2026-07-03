/**
 * Předkontace subsystem — the account-coding templates + the expander that turns
 * a captured partial_record into a balanced double-entry posting.
 */

export type {
  AmountBasis,
  PredkontaceEntry,
  PredkontaceScenario,
} from "./types"
export {
  SALES_SCENARIOS,
  PURCHASE_SCENARIOS,
  PREDKONTACE_BY_ID,
  getScenario,
} from "./catalogue"
export {
  expandPartialRecord,
  postFromPredkontace,
  type ExpandInput,
  type PostFromPredkontaceInput,
} from "./expand"
