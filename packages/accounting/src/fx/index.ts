/**
 * FX engine — cross-currency settlement (realized kurzový rozdíl) and §4/12
 * balance-sheet-day revaluation, both posting to 563/663 (ČÚS 006). The
 * capture-time rate freeze lives in capture.ts.
 */

export {
  periodFxPolicy,
  postFxSettlement,
  revalueOpenItemFx,
  type FxSettlementInput,
  type FxRevaluationInput,
} from "./engine"
