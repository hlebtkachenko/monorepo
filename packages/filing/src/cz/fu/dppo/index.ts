// Browser-safe DPPO (DPPDP9) barrel — mirrors the ./isdoc subpath. Re-exports the
// writer, adapter, checks, compute helpers, and model so a consumer (e.g. the web
// /vykazy DPPO generator) imports the pure pipeline WITHOUT dragging the root
// barrel's xmllint-wasm validator into its build. None of these modules import
// ../../../validate/*, so this subpath stays dependency-light (decimal.js-light +
// zod only). XSD validation stays a root-barrel (`validateFiling`) server-side call.

export { generateDppo } from "./write"
export { readDppo } from "./read"
export {
  computeDppoTotals,
  applyDppoTotals,
  DPPO_DERIVED_ATTRS,
  type DppoDerived,
} from "./compute"
export {
  buildDppoFromAccounting,
  type DppoFigures,
  type DppoFilingMeta,
} from "./adapter"
export { checkDppo, type DppoCheck } from "./checks"
export * from "../../../model/dppo"
