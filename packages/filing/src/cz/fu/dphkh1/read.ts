// DPHKH1 reader — inverse of the writer: parse `<Pisemnost><DPHKH1>` into the typed
// model. Repeated row věty (VetaA1…) become arrays; single věty (VetaA5/B3/C) stay
// objects. generate → read → generate is idempotent (see read.test.ts).

import { parse } from "../../../xml/parse"
import {
  Dphkh1Schema,
  type Dphkh1,
  type Dphkh1Input,
} from "../../../model/dphkh1"

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

function recordOrUndefined(node: unknown): Record<string, string> | undefined {
  const a = attrs(Array.isArray(node) ? node[0] : node)
  return Object.keys(a).length > 0 ? a : undefined
}

/** Parse a DPHKH1 XML document into the typed model. */
export function readDphkh1(xml: string): Dphkh1 {
  const tree = parse(xml) as Record<string, unknown>
  const pisemnost = tree.Pisemnost as Record<string, unknown> | undefined
  const doc = pisemnost?.DPHKH1 as Record<string, unknown> | undefined
  if (!doc) {
    throw new Error("filing/dphkh1: missing <Pisemnost><DPHKH1> root")
  }
  const model: Dphkh1Input = {
    verze: (doc[`${ATTR}verzePis`] as string) ?? undefined,
    header: attrs(doc.VetaD) as unknown as Dphkh1Input["header"],
    payer: attrs(doc.VetaP) as unknown as Dphkh1Input["payer"],
    a1: toArray(doc.VetaA1) as Dphkh1Input["a1"],
    a2: toArray(doc.VetaA2) as Dphkh1Input["a2"],
    a4: toArray(doc.VetaA4) as Dphkh1Input["a4"],
    a5: recordOrUndefined(doc.VetaA5),
    b1: toArray(doc.VetaB1) as Dphkh1Input["b1"],
    b2: toArray(doc.VetaB2) as Dphkh1Input["b2"],
    b3: recordOrUndefined(doc.VetaB3),
    c: recordOrUndefined(doc.VetaC),
  }
  return Dphkh1Schema.parse(model)
}
