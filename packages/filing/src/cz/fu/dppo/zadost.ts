// Žádost o předání účetní závěrky do sbírky listin (VetaUZ).
//
// § 21b odst. 3 zákona o účetnictví lets the účetní jednotka hand the závěrka to
// the rejstříkový soud THROUGH the tax return: the finanční úřad forwards it, so
// the same document is filed once instead of twice. Without this věta the return
// is still valid and still carries the výkazy, but nothing reaches the sbírka
// listin and the účetní jednotka has to file with the soud separately.
//
// One flag per part of the závěrka, "A"/"N", plus the e-mail the confirmation
// goes to. The XSD notes that address is the filer's own, NOT the soud's.
//
// Only the parts a podnikatel actually draws up are worth ticking: rozvaha, VZZ
// and příloha are the statutory minimum (§ 18 odst. 1), while the přehledy are
// optional for a small účetní jednotka (§ 18 odst. 2) and the MÚS závěrka only
// exists for the few entities under § 19a.

import type { DppoExtraVeta } from "../../../model/dppo"

const ZADOST_VETA = "VetaUZ"

/** Which parts of the závěrka the žádost covers. Absent = "N". */
export interface DppoZadostSbirka {
  rozvaha?: boolean
  vzz?: boolean
  /** Příloha v účetní závěrce. */
  priloha?: boolean
  /** Přehled o změnách vlastního kapitálu. */
  zmenyVlastnihoKapitalu?: boolean
  /** Přehled o peněžních tocích. */
  penezniToky?: boolean
  /** Účetní závěrka sestavená dle mezinárodních účetních standardů (§ 19a). */
  dleMus?: boolean
  /**
   * E-mail for the confirmation that the závěrka was handed over. The filer's
   * own address — the XSD is explicit that it must not be the soud's.
   */
  email?: string
}

function ano(value: boolean | undefined): string {
  return value ? "A" : "N"
}

/**
 * Build the žádost věta, or nothing when no part is requested.
 *
 * An all-"N" věta would be a žádost that asks for nothing, so an empty request
 * emits no věta at all rather than a row EPO has to ignore.
 */
export function buildZadostVety(zadost: DppoZadostSbirka): DppoExtraVeta[] {
  const parts = [
    zadost.rozvaha,
    zadost.vzz,
    zadost.priloha,
    zadost.zmenyVlastnihoKapitalu,
    zadost.penezniToky,
    zadost.dleMus,
  ]
  if (!parts.some(Boolean)) return []

  const attrs: Record<string, string> = {
    pr11_rozv: ano(zadost.rozvaha),
    pr11_vzz: ano(zadost.vzz),
    pr11_puz: ano(zadost.priloha),
    pr11_pzvk: ano(zadost.zmenyVlastnihoKapitalu),
    pr11_ppt: ano(zadost.penezniToky),
    pr11_uzmus: ano(zadost.dleMus),
  }
  const email = zadost.email?.trim()
  if (email) attrs.pr11_email = email
  return [{ tag: ZADOST_VETA, attrs }]
}
