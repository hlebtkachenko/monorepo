// DPPO reader — inverse of the writer: parse a `<Pisemnost><DPPDP9>` document into the
// typed model. VetaD → header, VetaP → payer, VetaO → vetaO, and every other věta
// (příloha) → extraVety, captured in the XSD sequence order (DPPO_EXTRA_VETA_TAGS) so
// nothing is lost. A repeatable věta (0..∞) yields one extraVety entry per occurrence.
// generate → read → generate is idempotent (see read.test.ts).

import { parse } from "../../../xml/parse"
import {
  DppoSchema,
  DPPO_EXTRA_VETA_TAGS,
  type Dppo,
  type DppoInput,
  type DppoExtraVeta,
} from "../../../model/dppo"

const ATTR = "@_"

/** Pull an element's attributes into a plain string record (drops the `@_` prefix). */
function attrs(node: unknown): Record<string, string> {
  const out: Record<string, string> = {}
  if (node && typeof node === "object") {
    for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
      if (k.startsWith(ATTR) && v != null) out[k.slice(ATTR.length)] = String(v)
    }
  }
  return out
}

function recordOrUndefined(node: unknown): Record<string, string> | undefined {
  const a = attrs(node)
  return Object.keys(a).length > 0 ? a : undefined
}

/** Parse a DPPO XML document into the typed model. */
export function readDppo(xml: string): Dppo {
  const tree = parse(xml) as Record<string, unknown>
  const pisemnost = tree.Pisemnost as Record<string, unknown> | undefined
  const doc = pisemnost?.DPPDP9 as Record<string, unknown> | undefined
  if (!doc) {
    throw new Error("filing/dppo: missing <Pisemnost><DPPDP9> root")
  }
  // Přílohy — collect every occurrence of each extra tag, in XSD sequence order.
  // A repeatable věta parses to an array; a single one to an object — normalize both.
  const extraVety: DppoExtraVeta[] = []
  for (const tag of DPPO_EXTRA_VETA_TAGS) {
    const raw = doc[tag]
    if (raw === undefined) continue
    const occurrences = Array.isArray(raw) ? raw : [raw]
    for (const occ of occurrences) extraVety.push({ tag, attrs: attrs(occ) })
  }
  const model: DppoInput = {
    verze: (doc[`${ATTR}verzePis`] as string) ?? undefined,
    header: attrs(doc.VetaD),
    payer: recordOrUndefined(doc.VetaP),
    vetaO: recordOrUndefined(doc.VetaO),
    extraVety,
  }
  return DppoSchema.parse(model)
}
