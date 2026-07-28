// DPHSHV (Souhrnné hlášení VIES) writer — emits `<Pisemnost><DPHSHV>` with the
// hlavička (VetaD), poplatník (VetaP), the recap rows (VetaR) and the call-off
// stock rows (VetaS) per the vendored XSD (02.01.04). The payer DIČ is stripped to
// digits; row values pass through verbatim (already whole koruna). Row order follows
// the model array. xmllint-wasm against the XSD is the gate.
//
// The writer does NOT emit VetaD's poc_radku / poc_stran / pln_poc_celk / suma_pln:
// the schema documents them as "nevyplňuje se - nebude bráno v úvahu", kept only so
// older input files still parse. Computing them would be inventing data FÚ discards.

import { veta, serializePisemnost, dicDigits, epoDate } from "../envelope"
import type { XmlNode } from "../../../xml/build"
import {
  DphshvSchema,
  DPHSHV_VERSION,
  type Dphshv,
  type DphshvHeader,
  type DphshvPayer,
} from "../../../model/dphshv"

function vetaD(h: DphshvHeader): XmlNode {
  return veta("VetaD", {
    k_uladis: h.k_uladis,
    dokument: h.dokument,
    shvies_forma: h.shvies_forma,
    rok: h.rok,
    mesic: h.mesic,
    ctvrt: h.ctvrt,
    d_poddp: epoDate(h.d_poddp),
  })
}

function vetaP(p: DphshvPayer): XmlNode {
  return veta("VetaP", {
    c_ufo: p.c_ufo,
    c_pracufo: p.c_pracufo,
    dic: dicDigits(p.dic),
    typ_ds: p.typ_ds,
    prijmeni: p.prijmeni,
    jmeno: p.jmeno,
    titul: p.titul,
    zkrobchjm: p.zkrobchjm,
    dodobchjm: p.dodobchjm,
    naz_obce: p.naz_obce,
    ulice: p.ulice,
    c_pop: p.c_pop,
    c_orient: p.c_orient,
    psc: p.psc,
    stat: p.stat,
    opr_prijmeni: p.opr_prijmeni,
    opr_jmeno: p.opr_jmeno,
    opr_postaveni: p.opr_postaveni,
    sest_prijmeni: p.sest_prijmeni,
    sest_jmeno: p.sest_jmeno,
    sest_telef: p.sest_telef,
    zast_kod: p.zast_kod,
    zast_typ: p.zast_typ,
    zast_prijmeni: p.zast_prijmeni,
    zast_jmeno: p.zast_jmeno,
    zast_nazev: p.zast_nazev,
    zast_dat_nar: p.zast_dat_nar,
    zast_ev_cislo: p.zast_ev_cislo,
    zast_ic: p.zast_ic,
  })
}

/** Generate a DPHSHV XML document from the typed model. */
export function generateDphshv(input: unknown): string {
  const m: Dphshv = DphshvSchema.parse(input)
  const vety: XmlNode[] = [vetaD(m.header), vetaP(m.payer)]
  for (const r of m.rows ?? []) vety.push(veta("VetaR", r))
  for (const r of m.callOff ?? []) vety.push(veta("VetaS", r))
  return serializePisemnost({
    documentTag: "DPHSHV",
    verzePis: m.verze || DPHSHV_VERSION,
    vety,
  })
}
