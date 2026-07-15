// FÚ EPO (daňový portál) filings — the `<Pisemnost>` envelope + attribute-centric věty.
export * from "./envelope"
export { generateDphdp3 } from "./dphdp3/write"
export { readDphdp3 } from "./dphdp3/read"
export {
  computeDphdp3Totals,
  applyDphdp3Totals,
  type Dphdp3Derived,
} from "./dphdp3/compute"
export { generateDphkh1 } from "./dphkh1/write"
export { readDphkh1 } from "./dphkh1/read"
export * from "./adapter"
