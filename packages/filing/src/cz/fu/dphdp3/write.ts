// DPHDP3 (Přiznání k DPH) writer — emits the `<Pisemnost><DPHDP3>` envelope with
// attribute-centric věty per the vendored XSD (03.01.03). VetaD/VetaP are formatted
// from the typed model (dates → D.M.YYYY, DIČ → digits); the value věty (Veta1..6)
// are emitted verbatim (already whole-koruna strings), so a document read → edited →
// written round-trips losslessly. xmllint-wasm against the vendored XSD is the gate.

import { veta, serializePisemnost, epoDate, dicDigits } from "../envelope"
import type { XmlNode } from "../../../xml/build"
import {
  Dphdp3Schema,
  DPHDP3_VERSION,
  type Dphdp3,
  type Dphdp3Header,
  type Dphdp3Payer,
} from "../../../model/dphdp3"

function vetaD(h: Dphdp3Header): XmlNode {
  return veta("VetaD", {
    k_uladis: h.k_uladis,
    dokument: h.dokument,
    dapdph_forma: h.dapdph_forma,
    typ_platce: h.typ_platce,
    rok: h.rok,
    mesic: h.mesic,
    ctvrt: h.ctvrt,
    zdobd_od: epoDate(h.zdobd_od),
    zdobd_do: epoDate(h.zdobd_do),
    c_okec: h.c_okec,
  })
}

function vetaP(p: Dphdp3Payer): XmlNode {
  return veta("VetaP", {
    c_ufo: p.c_ufo,
    c_pracufo: p.c_pracufo,
    dic: dicDigits(p.dic),
    typ_ds: p.typ_ds,
    zkrobchjm: p.zkrobchjm,
    jmeno: p.jmeno,
    prijmeni: p.prijmeni,
    titul: p.titul,
    naz_obce: p.naz_obce,
    ulice: p.ulice,
    c_pop: p.c_pop,
    c_orient: p.c_orient,
    psc: p.psc,
    stat: p.stat,
    email: p.email,
    c_telef: p.c_telef,
  })
}

/** Generate a DPHDP3 XML document from the typed model. */
export function generateDphdp3(input: unknown): string {
  const m: Dphdp3 = Dphdp3Schema.parse(input)
  const vety: XmlNode[] = [vetaD(m.header), vetaP(m.payer)]
  const value: [string, Dphdp3["veta1"]][] = [
    ["Veta1", m.veta1],
    ["Veta2", m.veta2],
    ["Veta3", m.veta3],
    ["Veta4", m.veta4],
    ["Veta5", m.veta5],
    ["Veta6", m.veta6],
  ]
  for (const [tag, rec] of value) {
    if (rec && Object.keys(rec).length > 0) vety.push(veta(tag, rec))
  }
  return serializePisemnost({
    documentTag: "DPHDP3",
    verzePis: m.verze || DPHDP3_VERSION,
    vety,
  })
}
