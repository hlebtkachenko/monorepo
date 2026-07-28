// DPHSHV reader — inverse of the writer: parse `<Pisemnost><DPHSHV>` into the typed
// model. The repeated věty (VetaR recap rows, VetaS call-off rows) become arrays;
// VetaD/VetaP stay objects. generate → read → generate is idempotent (see read.test.ts).

import { parse } from "../../../xml/parse"
import {
  DphshvSchema,
  type Dphshv,
  type DphshvInput,
} from "../../../model/dphshv"

const ATTR = "@_"

function attrs(node: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith(ATTR) && v != null) out[k.slice(ATTR.length)] = String(v)
    }
  }
  return out
}

/** fast-xml-parser yields a single object for one occurrence, an array for many. */
function toArray(node: unknown): Record<string, string>[] | undefined {
  if (node == null) return undefined
  const list = Array.isArray(node) ? node : [node]
  const rows = list.map(attrs).filter((r) => Object.keys(r).length > 0)
  return rows.length > 0 ? rows : undefined
}

/** Parse a DPHSHV XML document into the typed model. */
export function readDphshv(xml: string): Dphshv {
  const tree = parse(xml) as Record<string, unknown>
  const pisemnost = tree.Pisemnost as Record<string, unknown> | undefined
  const doc = pisemnost?.DPHSHV as Record<string, unknown> | undefined
  if (!doc) {
    throw new Error("filing/dphshv: missing <Pisemnost><DPHSHV> root")
  }
  const model: DphshvInput = {
    verze: (doc[`${ATTR}verzePis`] as string) ?? undefined,
    header: attrs(doc.VetaD) as unknown as DphshvInput["header"],
    payer: attrs(doc.VetaP) as unknown as DphshvInput["payer"],
    rows: toArray(doc.VetaR),
    callOff: toArray(doc.VetaS),
  }
  return DphshvSchema.parse(model)
}
