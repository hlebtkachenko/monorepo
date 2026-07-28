// Light DPH subpath — the three VAT filings' models, writers and readers WITHOUT
// pulling in the XSD validator. `validateFiling` drags xmllint-wasm (a ~1 MB WASM
// binary) plus every inlined schema through the import graph, which a form that only
// wants to build a document should not pay for. Mirrors ./dppo.
//
// Import this from app code that assembles or parses a DPH document; import the
// root barrel (or ./validate) only where the document is actually validated.

export {
  Dphdp3Schema,
  Dphdp3HeaderSchema,
  Dphdp3PayerSchema,
  DPHDP3_VERSION,
  type Dphdp3,
  type Dphdp3Input,
  type Dphdp3Header,
  type Dphdp3Payer,
} from "../../../model/dphdp3"

export {
  Dphkh1Schema,
  Dphkh1HeaderSchema,
  Dphkh1PayerSchema,
  Dphkh1A1RowSchema,
  Dphkh1A2RowSchema,
  Dphkh1A4RowSchema,
  Dphkh1B1RowSchema,
  Dphkh1B2RowSchema,
  Dphkh1AggregateSchema,
  DPHKH1_VERSION,
  type Dphkh1,
  type Dphkh1Input,
  type Dphkh1Header,
  type Dphkh1Payer,
  type Dphkh1A1Row,
  type Dphkh1A2Row,
  type Dphkh1A4Row,
  type Dphkh1B1Row,
  type Dphkh1B2Row,
  type Dphkh1Aggregate,
} from "../../../model/dphkh1"

export {
  DphshvSchema,
  DphshvHeaderSchema,
  DphshvPayerSchema,
  DphshvRowSchema,
  DphshvCallOffRowSchema,
  DPHSHV_VERSION,
  type Dphshv,
  type DphshvInput,
  type DphshvHeader,
  type DphshvPayer,
  type DphshvRow,
  type DphshvCallOffRow,
} from "../../../model/dphshv"

export { generateDphdp3 } from "../dphdp3/write"
export { readDphdp3 } from "../dphdp3/read"
export {
  computeDphdp3Totals,
  applyDphdp3Totals,
  type Dphdp3Derived,
} from "../dphdp3/compute"

export { generateDphkh1 } from "../dphkh1/write"
export { readDphkh1 } from "../dphkh1/read"

export { generateDphshv } from "../dphshv/write"
export { readDphshv } from "../dphshv/read"
export { checkDphshv, type DphshvCheck } from "../dphshv/checks"

export { koruna, korunaNahoru, haler, epoDate, dicDigits } from "../envelope"
