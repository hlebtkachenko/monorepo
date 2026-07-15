// DPHDP3 reader — inverse of the writer: parse a `<Pisemnost><DPHDP3>` document into
// the typed model. Header/payer attributes map to their typed fields; the value věty
// (Veta1..6) are captured as raw attribute records so nothing is lost. generate →
// read → generate is idempotent (see read.test.ts).

import { parse } from "../../../xml/parse"
import {
  Dphdp3Schema,
  type Dphdp3,
  type Dphdp3Input,
} from "../../../model/dphdp3"

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

function pick<K extends string>(
  src: Record<string, string>,
  keys: readonly K[],
): Partial<Record<K, string>> {
  const out: Partial<Record<K, string>> = {}
  for (const k of keys) if (src[k] !== undefined) out[k] = src[k]
  return out
}

const HEADER_KEYS = [
  "dokument",
  "k_uladis",
  "dapdph_forma",
  "typ_platce",
  "rok",
  "mesic",
  "ctvrt",
  "zdobd_od",
  "zdobd_do",
  "c_okec",
] as const

const PAYER_KEYS = [
  "c_ufo",
  "c_pracufo",
  "dic",
  "typ_ds",
  "zkrobchjm",
  "jmeno",
  "prijmeni",
  "titul",
  "naz_obce",
  "ulice",
  "c_pop",
  "c_orient",
  "psc",
  "stat",
  "email",
  "c_telef",
] as const

function recordOrUndefined(node: unknown): Record<string, string> | undefined {
  const a = attrs(node)
  return Object.keys(a).length > 0 ? a : undefined
}

/** Parse a DPHDP3 XML document into the typed model. */
export function readDphdp3(xml: string): Dphdp3 {
  const tree = parse(xml) as Record<string, unknown>
  const pisemnost = tree.Pisemnost as Record<string, unknown> | undefined
  const doc = pisemnost?.DPHDP3 as Record<string, unknown> | undefined
  if (!doc) {
    throw new Error("filing/dphdp3: missing <Pisemnost><DPHDP3> root")
  }
  const d = attrs(doc.VetaD)
  const p = attrs(doc.VetaP)
  const model: Dphdp3Input = {
    verze: (doc[`${ATTR}verzePis`] as string) ?? undefined,
    header: pick(d, HEADER_KEYS) as Dphdp3Input["header"],
    payer: pick(p, PAYER_KEYS) as Dphdp3Input["payer"],
    veta1: recordOrUndefined(doc.Veta1),
    veta2: recordOrUndefined(doc.Veta2),
    veta3: recordOrUndefined(doc.Veta3),
    veta4: recordOrUndefined(doc.Veta4),
    veta5: recordOrUndefined(doc.Veta5),
    veta6: recordOrUndefined(doc.Veta6),
  }
  return Dphdp3Schema.parse(model)
}
