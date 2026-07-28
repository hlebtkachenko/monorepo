// DPPO (Přiznání k dani z příjmů právnických osob) writer — emits the
// `<Pisemnost><DPPDP9>` envelope with attribute-centric věty per the vendored XSD
// (05.01.01). VetaD/VetaP are formatted from the model (dates → D.M.YYYY, DIČ →
// digits); VetaO and every příloha (extraVety) are emitted verbatim (already
// whole-koruna strings), so a document read → edited → written round-trips
// losslessly. The fixed hlavička codes (dokument="DP9", k_uladis="DPP") are injected
// here so a minimal model need not carry them. xmllint-wasm against the vendored XSD
// is the gate.

import { veta, serializePisemnost, epoDate, dicDigits } from "../envelope"
import type { XmlNode } from "../../../xml/build"
import {
  DppoSchema,
  DPPO_VERSION,
  DPPO_HEADER_DATE_ATTRS,
  DPPO_EXTRA_VETA_TAGS,
  type Dppo,
} from "../../../model/dppo"

function vetaD(header: Record<string, string>): XmlNode {
  const out: Record<string, string | undefined> = { ...header }
  // Fixed hlavička codes (XSD-`fixed`) — inject so a minimal model omits them.
  out.dokument = "DP9"
  out.k_uladis = "DPP"
  out.dapdpp_forma = header.dapdpp_forma || "B"
  for (const attr of DPPO_HEADER_DATE_ATTRS) {
    if (out[attr]) out[attr] = epoDate(out[attr])
  }
  return veta("VetaD", out)
}

function vetaP(payer: Record<string, string>): XmlNode {
  const out: Record<string, string | undefined> = { ...payer }
  if (out.dic) out.dic = dicDigits(out.dic)
  return veta("VetaP", out)
}

/** Generate a DPPO XML document from the typed model. */
export function generateDppo(input: unknown): string {
  const m: Dppo = DppoSchema.parse(input)
  const vety: XmlNode[] = [vetaD(m.header)]
  if (m.payer && Object.keys(m.payer).length > 0) vety.push(vetaP(m.payer))
  // VetaO is required (1..1); always emit it, even empty (<VetaO/>).
  vety.push(veta("VetaO", m.vetaO ?? {}))
  // Přílohy — verbatim, but re-ordered onto the XSD <xs:sequence> here rather
  // than trusting every caller to push in the right order. The builders each
  // emit one block and the adapter concatenates them, so the invariant used to
  // live in three places and hold only by comment; a wrong order is invalid XML
  // that no test outside this function would catch. Sort is stable, so rows
  // sharing a tag keep the c_radku order their builder produced, and a tag from
  // an uploaded return that this version does not know falls to the end.
  const order = new Map(
    DPPO_EXTRA_VETA_TAGS.map((tag, i) => [tag as string, i]),
  )
  const ordered = [...m.extraVety].sort(
    (a, b) =>
      (order.get(a.tag) ?? Number.MAX_SAFE_INTEGER) -
      (order.get(b.tag) ?? Number.MAX_SAFE_INTEGER),
  )
  for (const extra of ordered) vety.push(veta(extra.tag, extra.attrs))
  return serializePisemnost({
    documentTag: "DPPDP9",
    verzePis: m.verze || DPPO_VERSION,
    vety,
  })
}
