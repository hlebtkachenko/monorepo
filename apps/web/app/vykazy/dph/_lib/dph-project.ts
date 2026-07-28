// Projection: DPH evidence → the three typed EPO documents. Pure functions, no
// React, no I/O, no localStorage — everything here is unit-testable in isolation,
// which matters because a bug in this file is a wrong tax filing.
//
// The three filings are projections of ONE evidence array on purpose. EPO
// cross-checks the kontrolní hlášení against the přiznání (Σ A.4 + A.5 základ
// against ř.1 + ř.2), so deriving them from separate sources would let them drift
// and generate výzvy.

import Decimal from "decimal.js-light"
import {
  koruna,
  korunaNahoru,
  haler,
  splitVatId,
  type Dphdp3Input,
  type Dphkh1Input,
  type DphshvInput,
} from "@workspace/filing/dph"

import { DPH_LINE_BY_R, DPH_MANUAL_BY_ATTR } from "../../_data/dph-priznani"
import { sazbaBucket, SAZBY_DO_2023 } from "./dph-evidence"
import type { DphEvidence, DphEvidenceRow } from "./dph-evidence"

/** Identity block — mirrors the org config the builder already collects. */
export interface DphOrgMeta {
  /** Kód finančního úřadu (3-digit). */
  c_ufo: string
  /** DIČ, with or without the CZ prefix. */
  dic: string
  /** "P" právnická / "F" fyzická. */
  typ_ds: string
  nazev?: string
  naz_obce?: string
  ulice?: string
  c_pop?: string
  psc?: string
  email?: string
  c_telef?: string
}

const dec = (v: string | undefined) => new Decimal(v && v !== "" ? v : 0)

/**
 * Resolve a zdaňovací období to exactly ONE of měsíc / čtvrtletí.
 *
 * Every EPO form marks both optional, so a document carrying both passes XSD
 * validation and is then rejected on upload. The chosen cadence is explicit; the
 * fallback only picks a default for evidence saved before the choice existed.
 */
function obdobi(
  choice: "mesic" | "ctvrt" | undefined,
  mesic: string | undefined,
  ctvrt: string | undefined,
): { mesic?: string; ctvrt?: string } {
  const monthly = choice ? choice === "mesic" : !ctvrt
  return monthly ? { mesic } : { ctvrt }
}

/** Sum a field over rows, exactly (never native number arithmetic — money rule). */
function sum(rows: DphEvidenceRow[], pick: (r: DphEvidenceRow) => string) {
  return rows.reduce((acc, r) => acc.plus(dec(pick(r))), new Decimal(0))
}

// ── Přiznání k DPH ───────────────────────────────────────────────────────────

/**
 * Build the DPHDP3 model. Every evidence row carries the řádek it belongs to, so
 * the projection is a group-by over `radek`: the line's `base`/`dan` attributes
 * come from the statutory taxonomy, and rows on the same řádek add up.
 *
 * ř.62–65 are NOT computed here — `applyDphdp3Totals` from @workspace/filing
 * derives them from the XSD annotations, and doing it twice would risk two
 * different answers.
 */
export function projectPriznani(
  evidence: DphEvidence,
  meta: DphOrgMeta,
  forma = "B",
): Dphdp3Input {
  const vety: Record<number, Record<string, string>> = {
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
    6: {},
  }

  const byRadek = new Map<string, DphEvidenceRow[]>()
  for (const row of evidence.rows) {
    const list = byRadek.get(row.radek)
    if (list) list.push(row)
    else byRadek.set(row.radek, [row])
  }

  for (const [radek, rows] of byRadek) {
    const line = DPH_LINE_BY_R.get(radek)
    // An unknown or derived řádek is dropped rather than guessed onto an attribute.
    if (!line || line.derived) continue
    const target = vety[line.veta]
    if (!target) continue
    if (line.base) {
      const v = koruna(sum(rows, (r) => r.zaklad).toString())
      if (v && v !== "0") target[line.base] = v
    }
    if (line.dan) {
      const v = koruna(sum(rows, (r) => r.dan).toString())
      if (v && v !== "0") target[line.dan] = v
    }
  }

  // Manual values last so an explicitly typed figure always wins over a projected
  // one — the §76 koeficient and the krácený column are the plátce's own facts.
  for (const [attr, raw] of Object.entries(evidence.manual)) {
    if (raw === "") continue
    // Same table the UI renders from. A second copy here would let the two drift
    // and silently drop a typed value out of the filed XML.
    const field = DPH_MANUAL_BY_ATTR.get(attr)
    if (!field) continue
    const target = vety[field.veta]
    if (!target) continue
    // Koeficient attributes are percentages, not money — pass them through.
    target[attr] = field.percent ? raw.trim() : (koruna(raw) ?? raw.trim())
  }

  const notEmpty = (r: Record<string, string>) =>
    Object.keys(r).length > 0 ? r : undefined

  return {
    header: {
      dapdph_forma: forma,
      typ_platce: "P",
      rok: evidence.rok,
      // "Vyplníte jen tehdy, pokud podáváte dodatečné daňové přiznání" — and
      // there it is nezbytné for further processing.
      d_zjist: evidence.dZjist,
      ...obdobi(evidence.obdobi, evidence.mesic, evidence.ctvrt),
    },
    payer: {
      c_ufo: meta.c_ufo,
      dic: meta.dic,
      typ_ds: meta.typ_ds,
      zkrobchjm: meta.nazev,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
      email: meta.email,
      c_telef: meta.c_telef,
    },
    veta1: notEmpty(vety[1]!),
    veta2: notEmpty(vety[2]!),
    veta3: notEmpty(vety[3]!),
    veta4: notEmpty(vety[4]!),
    veta5: notEmpty(vety[5]!),
    veta6: notEmpty(vety[6]!),
  }
}

// ── Kontrolní hlášení ────────────────────────────────────────────────────────

/**
 * Rate buckets in KH's haléř format.
 *
 * Bucket 1 is the základní sazba, 2 the první snížená and 3 the druhá snížená.
 * The XSD is explicit that 2 and 3 are period-dependent: bucket 2 carries 12 %
 * today and 15 % "pro plnění s DPPD do 31. 12. 2023", bucket 3 exists only for
 * that older 10 %. An oprava of a pre-2024 doklad has to be filed at the rate
 * that applied then, so all four rates have to reach the right bucket.
 */
function buckets(rows: DphEvidenceRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  const put = (key: string, value: Decimal) => {
    const f = haler(value.toString())
    if (f && f !== "0.00") out[key] = f
  }
  const at = (bucket: 1 | 2 | 3, pick: (r: DphEvidenceRow) => string) =>
    sum(
      rows.filter((r) => sazbaBucket(r.sazba) === bucket),
      pick,
    )
  for (const bucket of [1, 2, 3] as const) {
    put(
      `zakl_dane${bucket}`,
      at(bucket, (r) => r.zaklad),
    )
    put(
      `dan${bucket}`,
      at(bucket, (r) => r.dan),
    )
  }
  return out
}

/** Group rows of one KH section by doklad, so one doklad is one řádek. */
function byDoklad(rows: DphEvidenceRow[]): DphEvidenceRow[][] {
  const map = new Map<string, DphEvidenceRow[]>()
  for (const r of rows) {
    const key = `${r.dic}|${r.evc}|${r.dppd}|${r.kodPredPl ?? ""}`
    const list = map.get(key)
    if (list) list.push(r)
    else map.set(key, [r])
  }
  return [...map.values()]
}

/**
 * Build the DPHKH1 model.
 *
 * The KH period is its own field: a kontrolní hlášení is MONTHLY for every
 * právnická osoba regardless of the DPH cadence (§ 101e odst. 1), so a quarterly
 * plátce still files twelve of them. Deriving the KH period from the přiznání
 * period is the classic way to file a wrong hlášení.
 */
export function projectKontrolniHlaseni(
  evidence: DphEvidence,
  meta: DphOrgMeta,
  forma = "B",
): Dphkh1Input {
  const inSection = (s: string) => evidence.rows.filter((r) => r.khSekce === s)

  const a1 = byDoklad(inSection("A1")).map((rows) => {
    const first = rows[0]!
    return {
      dic_odb: first.dic,
      c_evid_dd: first.evc,
      duzp: first.dppd,
      // A.1 carries základ only — the odběratel self-assesses the daň.
      zakl_dane1: haler(sum(rows, (r) => r.zaklad).toString()) ?? "0.00",
      kod_pred_pl: first.kodPredPl ?? "",
    }
  })

  const a2 = byDoklad(inSection("A2")).map((rows) => {
    const first = rows[0]!
    // A.2 splits the counterparty's VAT id: `k_stat` carries the country, and
    // `vatid_dod` is documented "ve formátu bez mezer bez kódu členského státu".
    // Filing the prefixed id gave EPO a value it cannot match in VIES, and for a
    // 12-character id (NL …B01, SE, LT, XI) it also blew the maxLength="12"
    // facet, so the whole hlášení failed XSD validation and could not be
    // exported at all. A supplier with no VAT id legitimately has neither field.
    const { k_stat, c_vat } = splitDic(first.dic)
    return {
      k_stat: k_stat || undefined,
      vatid_dod: c_vat || undefined,
      c_evid_dd: first.evc,
      dppd: first.dppd,
      ...buckets(rows),
    }
  })

  const a4 = byDoklad(inSection("A4")).map((rows) => {
    const first = rows[0]!
    return {
      dic_odb: first.dic,
      c_evid_dd: first.evc,
      dppd: first.dppd,
      ...buckets(rows),
      kod_rezim_pl: first.kodRezimPl ?? "0",
      zdph_44: first.zdph44 ?? "N",
    }
  })

  const b1 = byDoklad(inSection("B1")).map((rows) => {
    const first = rows[0]!
    return {
      dic_dod: first.dic,
      c_evid_dd: first.evc,
      duzp: first.dppd,
      ...buckets(rows),
      kod_pred_pl: first.kodPredPl ?? "",
    }
  })

  const b2 = byDoklad(inSection("B2")).map((rows) => {
    const first = rows[0]!
    return {
      dic_dod: first.dic,
      c_evid_dd: first.evc,
      dppd: first.dppd,
      ...buckets(rows),
      pomer: first.pomer ?? "N",
      zdph_44: first.zdph44 ?? "N",
    }
  })

  const aggregate = (section: string) => {
    const rows = inSection(section)
    if (rows.length === 0) return undefined
    const b = buckets(rows)
    return Object.keys(b).length > 0 ? b : undefined
  }

  return {
    header: {
      khdph_forma: forma,
      rok: evidence.rok,
      d_zjist: evidence.dZjist,
      c_jed_vyzvy: evidence.cJedVyzvy,
      vyzva_odp: evidence.vyzvaOdp,
      // KH is monthly for a právnická osoba regardless of the DPH cadence
      // (§ 101e odst. 1), but a fyzická osoba on a quarterly zdaňovací období
      // files it quarterly (§ 101e odst. 2). Emitting only `mesic` left a
      // quarterly filer's hlášení with NO period at all — XSD-valid, rejected.
      // The měsíc falls back to the DPH month, the čtvrtletí does NOT fall back
      // to the DPH quarter: monthly is the rule (§ 101e odst. 1) and quarterly
      // the § 101e odst. 2 exception, so a quarterly DPH filer still files
      // twelve hlášení unless the čtvrtletní cadence is chosen deliberately.
      ...obdobi(evidence.khObdobi, evidence.khMesic ?? evidence.mesic, evidence.khCtvrt), // prettier-ignore
    },
    payer: {
      c_ufo: meta.c_ufo,
      dic: meta.dic,
      typ_ds: meta.typ_ds,
      zkrobchjm: meta.nazev,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
      email: meta.email,
      c_telef: meta.c_telef,
    },
    a1: a1.length > 0 ? a1 : undefined,
    a2: a2.length > 0 ? a2 : undefined,
    a4: a4.length > 0 ? a4 : undefined,
    a5: aggregate("A5"),
    b1: b1.length > 0 ? b1 : undefined,
    b2: b2.length > 0 ? b2 : undefined,
    b3: aggregate("B3"),
  }
}

// ── Souhrnné hlášení ─────────────────────────────────────────────────────────

/**
 * Split a DIČ into (k_stat, c_vat) through the filing package's own splitter, so
 * the member-state list exists in exactly one place. No country code is passed:
 * on this path the id is all the caller has, and its prefix is authoritative.
 */
export function splitDic(dic: string): { k_stat: string; c_vat: string } {
  const { k_stat, c_vat } = splitVatId(null, dic)
  return { k_stat: k_stat ?? "", c_vat: c_vat ?? "" }
}

/**
 * Build the DPHSHV model from the rows that carry a kód plnění.
 *
 * Grouped by (k_stat, c_vat, k_pln_eu) because the schema forbids the same DIČ
 * appearing twice under the same kód, and `pln_pocet` counts DOKLADY, not evidence
 * rows — a doklad split across two sazby is one plnění.
 */
export function projectSouhrnneHlaseni(
  evidence: DphEvidence,
  meta: DphOrgMeta,
  forma = "R",
): DphshvInput {
  const merged = new Map<
    string,
    { k_stat: string; c_vat: string; kod: string; storno: boolean; doklady: Set<string>; value: Decimal } // prettier-ignore
  >()

  for (const row of evidence.rows) {
    if (!row.shKod) continue
    const { k_stat, c_vat } = splitDic(row.dic)
    // The storno flag is part of the grouping key. FÚ matches a storno against
    // the original on exactly (k_stat, c_vat, k_pln_eu), so a následné hlášení
    // legitimately carries a storno row and its replacement under the same
    // triple — merging them would cancel the correction against itself.
    const key = `${k_stat}|${c_vat}|${row.shKod}|${row.shStorno ? "S" : ""}`
    const entry = merged.get(key)
    if (entry) {
      entry.doklady.add(`${row.evc}|${row.dppd}`)
      entry.value = entry.value.plus(dec(row.zaklad))
    } else {
      merged.set(key, {
        k_stat,
        c_vat,
        kod: row.shKod,
        storno: row.shStorno === true,
        doklady: new Set([`${row.evc}|${row.dppd}`]),
        value: dec(row.zaklad),
      })
    }
  }

  const rows = [...merged.values()].map((r) => ({
    k_stat: r.k_stat || undefined,
    c_vat: r.c_vat || undefined,
    k_pln_eu: r.kod,
    pln_pocet: String(r.doklady.size),
    pln_hodnota: korunaNahoru(r.value.toString()),
    ...(r.storno ? { k_storno: "A" } : {}),
  }))

  return {
    header: {
      shvies_forma: forma,
      rok: evidence.rok,
      // § 102 odst. 5–6: the SH cadence is not the DPH cadence, and a hlášení
      // carrying both a měsíc and a čtvrtletí is rejected (checks.ts
      // OBDOBI_DVOJI). A quarterly filer who had already filled the monthly
      // přiznání period used to inherit it and emit both, with no way to clear.
      // Same asymmetry as the KH: § 102 odst. 6 quarterly is the exception, so
      // it is never inherited from the přiznání's cadence.
      ...obdobi(evidence.shObdobi, evidence.shMesic ?? evidence.mesic, evidence.shCtvrt), // prettier-ignore
    },
    payer: {
      c_ufo: meta.c_ufo,
      dic: meta.dic,
      typ_ds: meta.typ_ds,
      zkrobchjm: meta.nazev,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
    },
    rows: rows.length > 0 ? rows : undefined,
    // VetaS — call-off stock (§ 18) is a separate obligation carried on the same
    // hlášení, not a kód plnění, so it never joins the recap merge above.
    callOff:
      evidence.callOff && evidence.callOff.length > 0
        ? evidence.callOff.map((r) => {
            const { k_stat, c_vat } = splitDic(r.dic)
            const puv = splitDic(r.dicPuvodni ?? "")
            return {
              k_stat: k_stat || undefined,
              c_vat: c_vat || undefined,
              k_cos: r.kod,
              c_vat_puv: puv.c_vat || undefined,
            }
          })
        : undefined,
  }
}

// ── Pre-flight over the evidence ─────────────────────────────────────────────

/**
 * Faults the XSD cannot catch, checked against the CURRENT evidence rather than
 * against a stale import report.
 *
 * Every EPO form marks nearly everything `use="optional"`, and `veta()` omits an
 * empty attribute rather than emitting `attr=""` — so a row missing a mandatory
 * value produces a document that validates cleanly and is rejected on upload, or
 * worse, one that is accepted with an understated figure.
 */
export function evidenceIssues(
  evidence: DphEvidence,
  meta: DphOrgMeta,
): string[] {
  const out: string[] = []
  const where = (r: DphEvidenceRow) =>
    `${r.evc || r.dic || "doklad bez čísla"} (ř. ${r.radek})`

  if (meta.c_ufo === "") out.push("Vyberte finanční úřad — bez něj podání neprojde.") // prettier-ignore
  if (meta.dic === "") out.push("Vyplňte DIČ plátce.")

  for (const r of evidence.rows) {
    // "" means the amount could not be derived and was not typed. A zero here
    // would file an understated return that every kontrolní vazba passes.
    if (r.zaklad === "") out.push(`${where(r)}: chybí základ daně.`)
    if (r.dan === "") out.push(`${where(r)}: chybí daň.`)
    // kod_pred_pl is Povinná on A.1 and B.1 (§ 92 kód předmětu plnění).
    if ((r.khSekce === "A1" || r.khSekce === "B1") && !r.kodPredPl) {
      out.push(`${where(r)}: sekce ${r.khSekce} vyžaduje kód předmětu plnění (§ 92).`) // prettier-ignore
    }
    // dic_odb / dic_dod are Povinná on the doklad-level sections.
    if (
      (r.khSekce === "A1" ||
        r.khSekce === "A4" ||
        r.khSekce === "B1" ||
        r.khSekce === "B2") &&
      r.dic === ""
    ) {
      out.push(`${where(r)}: sekce ${r.khSekce} vyžaduje DIČ protistrany.`)
    }
    // 15 % and 10 % were retired on 31.12.2023 and survive only on an oprava of
    // an older doklad, so a current DPPD carrying one is nearly always a typo.
    if (SAZBY_DO_2023.has(r.sazba)) {
      const rok = Number(/(\d{4})\s*$/.exec(r.dppd.trim())?.[1] ?? 0)
      if (rok >= 2024) {
        out.push(`${where(r)}: sazba ${r.sazba} % platila do 31. 12. 2023, ale DPPD je ${r.dppd}. Ověřte.`) // prettier-ignore
      }
    }
    if (r.shKod && splitDic(r.dic).k_stat === "CZ") {
      out.push(`${where(r)}: do souhrnného hlášení nepatří tuzemská protistrana.`) // prettier-ignore
    }
  }
  return out
}

// ── Kontrolní vazby ──────────────────────────────────────────────────────────

export interface DphVazba {
  label: string
  left: string
  right: string
  ok: boolean
}

/**
 * The cross-form checks EPO itself runs. These are the reason all three filings
 * project from one evidence array; if any of them fails, the filings disagree and
 * the plátce gets a výzva.
 */
export function kontrolniVazby(evidence: DphEvidence): DphVazba[] {
  // The přiznání has only TWO rate columns (ř.1 základní, ř.2 snížená), while the
  // kontrolní hlášení has three buckets. Both reduced buckets therefore tie to
  // ř.2 — comparing bucket 2 alone would show a permanent mismatch on any
  // pre-2024 oprava filed at 10 %.
  const bucketOf = (r: DphEvidenceRow) => sazbaBucket(r.sazba)
  const matches = (r: DphEvidenceRow, group?: "zakladni" | "snizena") =>
    group === undefined ||
    (group === "zakladni" ? bucketOf(r) === 1 : bucketOf(r) === 2 || bucketOf(r) === 3) // prettier-ignore
  const onLines = (lines: string[], group?: "zakladni" | "snizena") =>
    sum(
      evidence.rows.filter((r) => lines.includes(r.radek) && matches(r, group)),
      (r) => r.zaklad,
    )
  const inSections = (sections: string[], group?: "zakladni" | "snizena") =>
    sum(
      evidence.rows.filter(
        (r) => sections.includes(r.khSekce ?? "") && matches(r, group),
      ),
      (r) => r.zaklad,
    )

  const mk = (label: string, a: Decimal, b: Decimal): DphVazba => ({
    label,
    left: a.toFixed(2),
    right: b.toFixed(2),
    ok: a.equals(b),
  })

  // These mirror VetaC of the DPHKH1 schema — the checks the finanční správa
  // runs itself. They are PER RATE: comparing A.4 + A.5 against ř.1 + ř.2 summed
  // across both rates nets out a doklad classified 21 % in the hlášení but posted
  // to ř.2 in the přiznání, so the panel stayed green on exactly the mismatch
  // EPO issues a výzva for. Compared exactly rather than to EPO's ±1000 Kč
  // tolerance: both sides are drawn unrounded from the same rows, so any
  // difference at all is a classification error, not rounding.
  return [
    mk("KH A.4 + A.5 (základní) = přiznání ř. 1", inSections(["A4", "A5"], "zakladni"), onLines(["1"], "zakladni")), // prettier-ignore
    mk("KH A.4 + A.5 (snížená) = přiznání ř. 2", inSections(["A4", "A5"], "snizena"), onLines(["2"], "snizena")), // prettier-ignore
    mk("KH B.2 + B.3 (základní) = přiznání ř. 40", inSections(["B2", "B3"], "zakladni"), onLines(["40"], "zakladni")), // prettier-ignore
    mk("KH B.2 + B.3 (snížená) = přiznání ř. 41", inSections(["B2", "B3"], "snizena"), onLines(["41"], "snizena")), // prettier-ignore
    mk("KH A.1 = přiznání ř. 25", inSections(["A1"]), onLines(["25"])),
    mk("KH B.1 = přiznání ř. 10 + ř. 11", inSections(["B1"]), onLines(["10", "11"])), // prettier-ignore
    mk("KH A.2 = přiznání ř. 3, 4, 5, 6, 9, 12, 13", inSections(["A2"]), onLines(["3", "4", "5", "6", "9", "12", "13"])), // prettier-ignore
    // Kód 2 (třístranný obchod, prostřední osoba dle § 17) is reported on ř. 31,
    // not ř. 20/21, so it belongs on both sides of the vazba. Leaving it only on
    // the SH side made a correct filing show a permanent ✕ and taught the user to
    // ignore the panel that exists to catch the real mismatches.
    mk("SH celkem = přiznání ř. 20 + ř. 21 + ř. 31", sum(evidence.rows.filter((r) => !!r.shKod), (r) => r.zaklad), onLines(["20", "21", "31"])), // prettier-ignore
  ]
}
