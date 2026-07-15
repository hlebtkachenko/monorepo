// DPHKH1 (Kontrolní hlášení) writer — emits `<Pisemnost><DPHKH1>` with the row věty
// A.1/A.2/A.4/A.5/B.1/B.2/B.3 (+ optional VetaC) per the vendored XSD (03.01.14).
// DIČ attributes are stripped to digits and dates normalised to D.M.YYYY; amount
// strings pass through verbatim (already haléře). Row order within a section follows
// the model array. xmllint-wasm against the XSD is the gate.

import { veta, serializePisemnost, epoDate, dicDigits } from "../envelope"
import type { XmlNode } from "../../../xml/build"
import {
  Dphkh1Schema,
  DPHKH1_VERSION,
  type Dphkh1,
  type Dphkh1Header,
  type Dphkh1Payer,
} from "../../../model/dphkh1"

function vetaD(h: Dphkh1Header): XmlNode {
  return veta("VetaD", {
    k_uladis: h.k_uladis,
    dokument: h.dokument,
    khdph_forma: h.khdph_forma,
    rok: h.rok,
    mesic: h.mesic,
    ctvrt: h.ctvrt,
    zdobd_od: epoDate(h.zdobd_od),
    zdobd_do: epoDate(h.zdobd_do),
  })
}

function vetaP(p: Dphkh1Payer): XmlNode {
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

/** Generate a DPHKH1 XML document from the typed model. */
export function generateDphkh1(input: unknown): string {
  const m: Dphkh1 = Dphkh1Schema.parse(input)
  const vety: XmlNode[] = [vetaD(m.header), vetaP(m.payer)]

  for (const r of m.a1 ?? [])
    vety.push(veta("VetaA1", { ...r, duzp: epoDate(r.duzp), dic_odb: dicDigits(r.dic_odb) })) // prettier-ignore
  for (const r of m.a2 ?? [])
    vety.push(veta("VetaA2", { ...r, dppd: epoDate(r.dppd) }))
  for (const r of m.a4 ?? [])
    vety.push(veta("VetaA4", { ...r, dppd: epoDate(r.dppd), dic_odb: dicDigits(r.dic_odb) })) // prettier-ignore
  if (m.a5) vety.push(veta("VetaA5", m.a5))
  for (const r of m.b1 ?? [])
    vety.push(veta("VetaB1", { ...r, duzp: epoDate(r.duzp), dic_dod: dicDigits(r.dic_dod) })) // prettier-ignore
  for (const r of m.b2 ?? [])
    vety.push(veta("VetaB2", { ...r, dppd: epoDate(r.dppd), dic_dod: dicDigits(r.dic_dod) })) // prettier-ignore
  if (m.b3) vety.push(veta("VetaB3", m.b3))
  if (m.c && Object.keys(m.c).length > 0) vety.push(veta("VetaC", m.c))

  return serializePisemnost({
    documentTag: "DPHKH1",
    verzePis: m.verze || DPHKH1_VERSION,
    vety,
  })
}
