// Read the DPH evidence straight out of the same workbook that carries the deník,
// and JOIN it to the deník on the doklad.
//
// The evidence sheet holds one row per DOKLAD and carries only what the deník
// cannot: the counterparty's DIČ, the DPPD (the tax point, which diverges from
// the účetní datum across a month boundary), the supplier's own evidenční číslo
// that KH B.2 demands, and the classification (řádek přiznání, KH sekce, §92 kód,
// SH kód). Amounts are optional — left blank they come from the deník's own
// postings for that doklad, so no figure is ever typed twice and the kontrolní
// hlášení cannot disagree with the books by arithmetic.
//
// The join key is (Zdroj, Číslo), not Číslo alone: a workbook routinely has an
// FV 001 and an FP 001, and collapsing them would file the odběratel's doklad as
// the dodavatel's.

import Decimal from "decimal.js-light"

import { excelSerialToDate, findSheet, type Cell, type DenikRow, type WorkbookSheets } from "../../_lib/denik" // prettier-ignore
import { DPH_LINE_BY_R } from "../../_data/dph-priznani"
import {
  KH_SEKCE_SET,
  parseAmount,
  parseSazba,
  type DphEvidenceRow,
  type DphSmer,
  type KhSekce,
} from "./dph-evidence"

/** Sheet-tab names accepted for the DPH evidence. */
const DPH_SHEET_NAMES = [
  "dph",
  "evidence dph",
  "dph evidence",
  "evidence pro účely dph",
  "evidence pro ucely dph",
] as const

/** Účet prefix that carries daň — everything else on a doklad is base or settlement. */
const VAT_ACCOUNT_PREFIX = "343"

type FieldKey =
  | "zdroj"
  | "cislo"
  | "dic"
  | "dppd"
  | "evc"
  | "radek"
  | "sazba"
  | "zaklad"
  | "dan"
  | "khSekce"
  | "kodPredPl"
  | "kodRezimPl"
  | "zdph44"
  | "pomer"
  | "shKod"
  | "poznamka"

const HEADERS: Record<string, FieldKey> = {
  Zdroj: "zdroj",
  Číslo: "cislo",
  Cislo: "cislo",
  DIČ: "dic",
  DIC: "dic",
  DPPD: "dppd",
  "Ev. číslo dodavatele": "evc",
  "Ev. číslo": "evc",
  "Evidenční číslo": "evc",
  Řádek: "radek",
  Radek: "radek",
  Sazba: "sazba",
  Základ: "zaklad",
  Zaklad: "zaklad",
  Daň: "dan",
  Dan: "dan",
  "KH sekce": "khSekce",
  "Kód předmětu plnění": "kodPredPl",
  "Kód režimu": "kodRezimPl",
  "§44": "zdph44",
  Poměr: "pomer",
  "SH kód": "shKod",
  Poznámka: "poznamka",
}

const REQUIRED = ["Zdroj", "Číslo", "Řádek"]

export interface DphSheetIssue {
  severity: "error" | "warning"
  message: string
}

export interface DphSheetResult {
  rows: DphEvidenceRow[]
  issues: DphSheetIssue[]
  ignoredColumns: string[]
  /** False when the workbook has no DPH sheet at all (not an error — it is optional). */
  found: boolean
  headerOk: boolean
  missingHeaders: string[]
}

function cellText(row: Cell[], col: number | undefined): string {
  if (col === undefined) return ""
  const v = row[col]
  if (v === null || v === undefined) return ""
  return typeof v === "string" ? v.trim() : String(v)
}

/** Excel serial -> D.M.YYYY, through the deník's own converter (1904-aware). */
function cellDate(
  row: Cell[],
  col: number | undefined,
  date1904: boolean,
): string {
  if (col === undefined) return ""
  const v = row[col]
  if (typeof v === "number" && Number.isFinite(v)) {
    // Through the deník's converter so the 1904 date system is handled once,
    // then back to the EPO D.M.YYYY shape this module has always emitted.
    return excelSerialToDate(v, date1904).replace(/\b0(\d)/g, "$1")
  }
  return typeof v === "string" ? v.trim() : ""
}

/**
 * Fold a join component the way the reader folds tab names.
 *
 * Case, diacritics and internal whitespace all vary between two sheets of the
 * same workbook ("Přijaté faktury" on one, "prijate  faktury" on the other), and
 * an exact string comparison turns that into "doklad není v deníku".
 */
function foldKeyPart(v: string): string {
  return v
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim()
}

/** Join key. (Zdroj, Číslo) — see the module doc for why Číslo alone is wrong. */
function dokladKey(zdroj: string, cislo: string): string {
  return `${foldKeyPart(zdroj)}|${foldKeyPart(cislo)}`
}

/**
 * The same key with the číslo's leading zeros removed.
 *
 * Excel coerces a číslo typed as `001` into the number 1 on one sheet while the
 * other keeps it as text, so the two sides of the join disagree about a doklad
 * that is plainly the same one. This relaxed key is a FALLBACK and it is
 * reported when it fires — a silent match on a relaxed key is how the wrong
 * doklad gets paired.
 */
function looseDokladKey(zdroj: string, cislo: string): string {
  return `${foldKeyPart(zdroj)}|${foldKeyPart(cislo).replace(/^0+(?=\d)/, "")}`
}

interface DokladTotals {
  /** Zdroj and číslo exactly as the deník spells them, for the user-facing
   *  messages. The join key is folded and joined with "|", so reconstructing
   *  them from it would both lose the original case and break on a číslo that
   *  contains a "|" of its own. */
  zdroj: string
  cislo: string
  /** Sum of the 343 legs — the daň actually booked for this doklad. */
  dan: Decimal
  /** Sum of every non-343 leg on the side opposite the daň. */
  zaklad: Decimal
  firma?: string
  ic?: string
  rows: number
}

/**
 * Index the deník by doklad, keeping the figures the evidence can inherit.
 *
 * `zaklad` deliberately sums only the legs on the side OPPOSITE the 343 leg: an
 * issued invoice books 311 MD / 602 DAL / 343 DAL, so counting every non-343 leg
 * would add the 311 receivable to the 602 revenue and double the base. Where a
 * doklad has no 343 leg at all (osvobozená plnění, PDP dodavatel) the base is the
 * whole doklad and there is nothing to take a side from, so those must carry an
 * explicit Základ on the DPH sheet.
 */
export function indexDenikByDoklad(
  rows: DenikRow[],
): Map<string, DokladTotals> {
  const out = new Map<string, DokladTotals>()
  const byKey = new Map<string, DenikRow[]>()
  for (const r of rows) {
    if (r.cislo.trim() === "") continue
    const key = dokladKey(r.zdroj, r.cislo)
    const list = byKey.get(key)
    if (list) list.push(r)
    else byKey.set(key, [r])
  }

  for (const [key, group] of byKey) {
    let dan = new Decimal(0)
    // Which side the daň sits on decides which side the base is read from.
    let vatOnMd = false
    let vatOnDal = false
    for (const r of group) {
      const md = r.md.trim().startsWith(VAT_ACCOUNT_PREFIX)
      const dal = r.dal.trim().startsWith(VAT_ACCOUNT_PREFIX)
      // A leg that is 343 on BOTH sides is a samovyměření or a 343↔343 zápočet:
      // it moves daň between analytics without creating any, so it adds nothing.
      if (md && dal) continue
      if (md) {
        dan = dan.plus(new Decimal(r.castka))
        vatOnMd = true
      } else if (dal) {
        dan = dan.plus(new Decimal(r.castka))
        vatOnDal = true
      }
    }

    let zaklad = new Decimal(0)
    for (const r of group) {
      const md = r.md.trim()
      const dal = r.dal.trim()
      if (md.startsWith(VAT_ACCOUNT_PREFIX) || dal.startsWith(VAT_ACCOUNT_PREFIX)) continue // prettier-ignore
      // Base sits opposite the daň: daň on DAL (issued) → base is the DAL leg
      // (výnos); daň on MD (received) → base is the MD leg (náklad/majetek).
      // A leg missing one of its sides carries no information about which side
      // the base sits on; treating a blank DAL as "not a 3xx account" made a
      // one-sided 311 leg count as base and doubled the figure.
      if (md === "" || dal === "") continue
      const isBase = vatOnDal
        ? !dal.startsWith("3") && !dal.startsWith("2")
        : vatOnMd
          ? !md.startsWith("3") && !md.startsWith("2")
          : false
      if (isBase) zaklad = zaklad.plus(new Decimal(r.castka))
    }

    const withParty = group.find((r) => r.firma || r.ic)
    const first = group[0]!
    out.set(key, {
      zdroj: first.zdroj.trim(),
      cislo: first.cislo.trim(),
      dan,
      zaklad,
      firma: withParty?.firma,
      ic: withParty?.ic,
      rows: group.length,
    })
  }
  return out
}

/**
 * Parse the DPH sheet and join it to the deník.
 *
 * `denik` may be empty — the sheet then stands alone and every row must carry its
 * own Základ. When the deník IS present, a row without amounts inherits them, and
 * a row WITH amounts is cross-checked against the books; a mismatch is reported
 * rather than silently preferred either way.
 */
export function parseDphSheet(
  sheets: WorkbookSheets,
  denik: DenikRow[],
): DphSheetResult {
  const found = findSheet(sheets, DPH_SHEET_NAMES)
  if (!found) {
    return {
      rows: [],
      issues: [],
      ignoredColumns: [],
      found: false,
      headerOk: false,
      missingHeaders: [],
    }
  }

  const grid = found.grid
  const header = grid[0] ?? []
  const ignoredColumns: string[] = []
  const cols: Partial<Record<FieldKey, number>> = {}
  header.forEach((cell, idx) => {
    const name = typeof cell === "string" ? cell.trim() : cell === null ? "" : String(cell).trim() // prettier-ignore
    if (name === "") return
    const field = HEADERS[name]
    if (field === undefined) {
      ignoredColumns.push(name)
      return
    }
    if (cols[field] === undefined) cols[field] = idx
  })

  const missingHeaders = REQUIRED.filter(
    (n) => cols[HEADERS[n] as FieldKey] === undefined,
  )
  if (missingHeaders.length > 0) {
    return {
      rows: [],
      issues: [
        {
          severity: "error",
          message: `List „${found.name}“ nemá povinné sloupce: ${missingHeaders.join(", ")}.`,
        },
      ],
      ignoredColumns,
      found: true,
      headerOk: false,
      missingHeaders,
    }
  }

  const index = indexDenikByDoklad(denik)
  const issues: DphSheetIssue[] = []
  const rows: DphEvidenceRow[] = []
  const seen = new Set<string>()

  // Relaxed index, for the leading-zero coercion only. Ambiguous entries (both
  // "001" and "1" booked under the same Zdroj) are dropped rather than guessed.
  const loose = new Map<string, string | null>()
  for (const [key, totals] of index) {
    const lk = looseDokladKey(totals.zdroj, totals.cislo)
    loose.set(lk, loose.has(lk) ? null : key)
  }

  // A sheet with NO evidenční-číslo column at all is different from a blank cell:
  // the fallback would file the plátce's own internal doklad number as the
  // counterparty's, which pairs with nothing on their side and earns a výzva on
  // every received invoice.
  const hasEvcColumn = cols.evc !== undefined

  for (let i = 1; i < grid.length; i++) {
    const line = grid[i]
    if (!line) continue
    const zdroj = cellText(line, cols.zdroj)
    const cislo = cellText(line, cols.cislo)
    const radek = cellText(line, cols.radek)
    if (zdroj === "" && cislo === "" && radek === "") continue
    const where = `Řádek ${i + 1}`

    if (cislo === "" || radek === "") {
      issues.push({
        severity: "error",
        message: `${where}: chybí ${cislo === "" ? "číslo dokladu" : "řádek přiznání"} — řádek je vynechán.`,
      })
      continue
    }

    if (!DPH_LINE_BY_R.has(radek)) {
      issues.push({
        severity: "error",
        message: `${where}: „${radek}“ není řádek přiznání k DPH — řádek je vynechán.`,
      })
      continue
    }

    const key = dokladKey(zdroj, cislo)
    // A doklad listed twice is legitimate (one doklad across two sazby), but the
    // second row must NOT inherit the deník totals again: both rows would then
    // carry the whole amount and the filed základ would be double.
    const repeated = seen.has(key)
    if (repeated) {
      issues.push({
        severity: "error",
        message: `${where}: doklad ${zdroj} ${cislo} je v evidenci vícekrát. Vyplňte u obou řádků Základ i Daň ručně — z deníku se rozdělit nedají.`,
      })
    }
    seen.add(key)

    let booked = index.get(key)
    if (!booked) {
      const alias = loose.get(looseDokladKey(zdroj, cislo))
      const aliased = alias ? index.get(alias) : undefined
      if (alias && aliased) {
        booked = aliased
        seen.add(alias)
        issues.push({
          severity: "warning",
          message: `${where}: doklad ${zdroj} ${cislo} spárován s dokladem ${aliased.zdroj} ${aliased.cislo} (Excel odstranil vodicí nuly). Ověřte, že jde o tentýž doklad.`,
        })
      }
    }
    if (!booked) {
      issues.push({
        severity: "error",
        message: `${where}: doklad ${zdroj} ${cislo} není v deníku. Překlep v čísle, nebo chybí zaúčtování.`,
      })
    }

    const sazbaCell = cellText(line, cols.sazba)
    const sazba = parseSazba(sazbaCell)
    if (!sazba.ok) {
      issues.push({
        severity: "error",
        message: `${where}: sazba „${sazbaCell}“ není 21 %, 12 % ani nula — řádek je vynechán, aby doklad nevypadl z kontrolního hlášení.`,
      })
      continue
    }

    const zakladCell = cellText(line, cols.zaklad)
    const danCell = cellText(line, cols.dan)
    const parsedZaklad = parseAmount(zakladCell)
    const parsedDan = parseAmount(danCell)
    if (!parsedZaklad.ok || !parsedDan.ok) {
      issues.push({
        severity: "error",
        message: `${where}: základ nebo daň není číslo („${!parsedZaklad.ok ? zakladCell : danCell}“) — řádek je vynechán, aby se nezaložil nulou.`,
      })
      continue
    }
    const typedZaklad = parsedZaklad.value
    const typedDan = parsedDan.value

    let zaklad = typedZaklad
    let dan = typedDan

    if (booked && !repeated) {
      if (typedZaklad === undefined) {
        // Fire whenever the base could not be DERIVED, not only when a daň was
        // booked without one. A doklad with no 343 leg at all — osvobozené
        // plnění § 64/§ 66, the PDP dodavatel side, ř. 20/21/22/25 — leaves both
        // totals at zero, and the old guard (`zaklad.isZero() && !dan.isZero()`)
        // stayed silent on exactly those rows and filed a zero.
        if (booked.zaklad.isZero()) {
          issues.push({
            severity: "error",
            message: `${where}: doklad ${zdroj} ${cislo} — základ se ze zaúčtování odvodit nedá (doklad nemá účet 343). Vyplňte sloupec Základ.`,
          })
        } else {
          zaklad = booked.zaklad.toString()
        }
      } else if (
        !new Decimal(typedZaklad).equals(booked.zaklad) &&
        !booked.zaklad.isZero()
      ) {
        // prettier-ignore
        issues.push({
          severity: "warning",
          message: `${where}: doklad ${zdroj} ${cislo} — základ v evidenci (${typedZaklad}) nesouhlasí se zaúčtováním (${booked.zaklad.toString()}).`,
        })
      }
      if (typedDan === undefined) dan = booked.dan.toString()
      else if (
        !new Decimal(typedDan).equals(booked.dan) &&
        !booked.dan.isZero()
      ) {
        issues.push({
          severity: "warning",
          message: `${where}: doklad ${zdroj} ${cislo} — daň v evidenci (${typedDan}) nesouhlasí s účtem 343 (${booked.dan.toString()}).`,
        })
      }
    }

    // DIČ: taken from the sheet, else proposed from the deník's IČ. A Czech
    // právnická osoba is CZ+IČO in the overwhelming majority, but a fyzická osoba
    // registers under a rodné číslo and a skupinová registrace under CZ699…, so
    // the proposal is flagged rather than trusted.
    let dic = cellText(line, cols.dic).replace(/\s/g, "").toUpperCase()
    if (dic === "" && booked?.ic) {
      dic = `CZ${booked.ic.replace(/\D/g, "")}`
      issues.push({
        severity: "warning",
        message: `${where}: DIČ doplněno z IČ jako ${dic}. Ověřte — fyzická osoba i skupinová registrace mají jiné.`,
      })
    }

    // Every dot, not just the first: "B.2." folded to "B2." and then matched no
    // section, dropping the doklad out of the kontrolní hlášení entirely.
    const khCell = cellText(line, cols.khSekce)
    const khRaw = khCell.toUpperCase().replace(/\./g, "")
    if (khRaw !== "" && !KH_SEKCE_SET.has(khRaw)) {
      issues.push({
        severity: "error",
        message: `${where}: „${khCell}“ není sekce kontrolního hlášení — řádek je vynechán.`,
      })
      continue
    }
    if (!hasEvcColumn && (khRaw === "B1" || khRaw === "B2")) {
      issues.push({
        severity: "error",
        message: `${where}: sekce ${khRaw} vyžaduje evidenční číslo dokladu dodavatele, ale list nemá sloupec „Ev. číslo dodavatele“.`,
      })
    }

    const smer: DphSmer = Number(radek) >= 40 && Number(radek) <= 47 ? "vstup" : "vystup" // prettier-ignore

    const row: DphEvidenceRow = {
      id: `sheet-${zdroj}-${cislo}-${i}`,
      smer,
      dppd: cellDate(line, cols.dppd, sheets.date1904),
      evc: cellText(line, cols.evc) || cislo,
      dic,
      radek,
      sazba: sazba.sazba,
      // Empty, never "0": an amount that could not be derived is UNKNOWN, and a
      // zero here files an understated return that every kontrolní vazba passes.
      zaklad: zaklad ?? "",
      dan: dan ?? "",
    }
    if (booked?.firma) row.nazev = booked.firma
    if (khRaw) row.khSekce = khRaw as KhSekce
    const kodPredPl = cellText(line, cols.kodPredPl)
    if (kodPredPl) row.kodPredPl = kodPredPl
    const kodRezimPl = cellText(line, cols.kodRezimPl)
    if (kodRezimPl) row.kodRezimPl = kodRezimPl
    const zdph44 = cellText(line, cols.zdph44)
    if (zdph44) row.zdph44 = zdph44.toUpperCase()
    const pomer = cellText(line, cols.pomer)
    if (pomer) row.pomer = pomer.toUpperCase()
    const shKod = cellText(line, cols.shKod)
    if (shKod) row.shKod = shKod
    const poznamka = cellText(line, cols.poznamka)
    if (poznamka) row.poznamka = poznamka

    rows.push(row)
  }

  // The reverse check: a doklad the books put through 343 but the evidence never
  // mentions. That is a plnění missing from the přiznání, which is the expensive
  // direction of this error.
  for (const [key, totals] of index) {
    if (seen.has(key) || totals.dan.isZero()) continue
    issues.push({
      severity: "error",
      message: `Doklad ${totals.zdroj} ${totals.cislo} má v deníku daň ${totals.dan.toString()} Kč, ale v evidenci DPH chybí.`,
    })
  }

  return {
    rows,
    issues,
    ignoredColumns,
    found: true,
    headerOk: true,
    missingHeaders: [],
  }
}
