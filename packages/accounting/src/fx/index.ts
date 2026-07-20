/**
 * FX engine — cross-currency settlement (realized kurzový rozdíl) and §4/12
 * balance-sheet-day revaluation, both posting to 563/663 (ČÚS 006). The
 * capture-time rate freeze lives in capture.ts; rate resolution (the fetch half,
 * override -> ČNB -> error) lives in rates.ts.
 */

export {
  periodFxPolicy,
  postFxSettlement,
  revalueOpenItemFx,
  type FxSettlementInput,
  type FxRevaluationInput,
} from "./engine"

export {
  resolveFxRate,
  effectiveRate,
  convertAmount,
  convertAmountAt,
  FxRateNotFoundError,
  type ResolvedFxRate,
  type FxRateQuery,
} from "./rates"

export { listFxRates, type FxRateListRow } from "./list"
