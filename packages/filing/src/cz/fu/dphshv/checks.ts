// DPHSHV kritické kontroly — warn-only business checks over a built model, mirroring
// checkDppo. These exist because the XSD is a weak gate for this form: it marks
// k_stat, c_vat, k_pln_eu and pln_hodnota `use="optional"` while the schema's own
// documentation calls all four "Povinné" on any row that is not a storno row. An
// XSD-valid DPHSHV is therefore routinely a document EPO rejects, so the caller
// needs a second opinion before offering the file for upload.
//
// Never throws and never blocks: it reports. The rule text quoted in each message
// comes from the vendored XSD's xs:documentation.

import type { Dphshv } from "../../../model/dphshv"

export interface DphshvCheck {
  /** Stable id so the UI can order or suppress a specific finding. */
  code: string
  /** "error" — EPO will reject. "warning" — likely a query, or unverifiable here. */
  severity: "error" | "warning"
  /** Czech, user-facing: this surfaces next to the download button. */
  message: string
  /** 0-based index into `rows`, when the finding belongs to one row. */
  row?: number
}

/** Prefixes VIES accepts. Greece registers under EL, not its ISO code GR. */
const MEMBER_STATES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO",
  "SE", "SI", "SK", "XI",
]) // prettier-ignore

const KODY_PLNENI = new Set(["0", "1", "2", "3"])

/** Kód plnění that makes the hlášení a goods filing, forcing monthly cadence (§102/6). */
const GOODS_KODY = new Set(["0", "1", "2"])

/**
 * Run the business checks over a built DPHSHV model. Returns every finding; an
 * empty array means nothing objectionable was found (which is not a promise that
 * EPO will accept the document — only that these rules pass).
 */
export function checkDphshv(m: Dphshv): DphshvCheck[] {
  const out: DphshvCheck[] = []
  const rows = m.rows ?? []
  const forma = m.header.shvies_forma

  if (forma !== "R" && forma !== "N") {
    out.push({
      code: "FORMA_NEZNAMA",
      severity: "error",
      message: `Forma hlášení "${forma}" není platná — přípustné je R (souhrnné hlášení) nebo N (následné souhrnné hlášení).`,
    })
  }

  // "Vyplnění měsíce a roku ZO nebo čtvrtletí a roku ZO je povinné."
  const hasMesic = (m.header.mesic ?? "") !== ""
  const hasCtvrt = (m.header.ctvrt ?? "") !== ""
  if (!hasMesic && !hasCtvrt) {
    out.push({
      code: "OBDOBI_CHYBI",
      severity: "error",
      message:
        "Chybí zdaňovací období — vyplňte měsíc a rok, nebo čtvrtletí a rok.",
    })
  } else if (hasMesic && hasCtvrt) {
    out.push({
      code: "OBDOBI_DVOJI",
      severity: "error",
      message: "Je vyplněn měsíc i čtvrtletí — vyplňte pouze jedno z nich.",
    })
  }

  // §102/6: čtvrtletní souhrnné hlášení je možné jen u samotných služeb dle §9/1.
  if (hasCtvrt && rows.some((r) => GOODS_KODY.has(r.k_pln_eu ?? ""))) {
    out.push({
      code: "CTVRTLETNI_SE_ZBOZIM",
      severity: "error",
      message:
        "Čtvrtletní souhrnné hlášení smí obsahovat jen služby (kód 3). Je-li vykázáno dodání zboží, přemístění majetku nebo třístranný obchod, podává se hlášení měsíčně (§102 odst. 6 ZDPH).",
    })
  }

  const seen = new Map<string, number>()
  rows.forEach((r, i) => {
    const storno = r.k_storno === "A"

    // "Nesmí být uvedeno v souhrnném hlášení formy SH = R."
    if (storno && forma === "R") {
      out.push({
        code: "STORNO_V_RADNEM",
        severity: "error",
        message: `Řádek ${i + 1}: storno řádek nesmí být v řádném souhrnném hlášení (forma R). Storno se podává následným hlášením (forma N).`,
        row: i,
      })
    }

    if (!storno) {
      if ((r.k_stat ?? "") === "" || (r.c_vat ?? "") === "") {
        out.push({
          code: "DIC_CHYBI",
          severity: "error",
          message: `Řádek ${i + 1}: chybí kód státu nebo DIČ pořizovatele — na řádku, který není storno, jsou povinné.`,
          row: i,
        })
      }
      if ((r.pln_hodnota ?? "") === "") {
        out.push({
          code: "HODNOTA_CHYBI",
          severity: "error",
          message: `Řádek ${i + 1}: chybí hodnota plnění — na řádku, který není storno, je povinná.`,
          row: i,
        })
      }
    }

    const stat = r.k_stat ?? ""
    if (stat !== "" && !MEMBER_STATES.has(stat)) {
      out.push({
        code: "STAT_NENI_CLENSKY",
        severity: "error",
        message: `Řádek ${i + 1}: "${stat}" není kód členského státu EU. Řecko se v souhrnném hlášení uvádí jako EL (nikoli GR), Severní Irsko jako XI.`,
        row: i,
      })
    }
    if (stat === "CZ") {
      out.push({
        code: "STAT_TUZEMSKO",
        severity: "error",
        message: `Řádek ${i + 1}: tuzemský odběratel (CZ) do souhrnného hlášení nepatří — jde o tuzemské plnění, ne dodání do jiného členského státu.`,
        row: i,
      })
    }

    const kod = r.k_pln_eu ?? ""
    if (kod !== "" && !KODY_PLNENI.has(kod)) {
      out.push({
        code: "KOD_PLNENI_NEPLATNY",
        severity: "error",
        message: `Řádek ${i + 1}: kód plnění "${kod}" není platný — přípustné jsou 0, 1, 2 a 3.`,
        row: i,
      })
    }
    if (kod === "2") {
      out.push({
        code: "KOD_2_TRISTRANNY",
        severity: "warning",
        message: `Řádek ${i + 1}: kód 2 (třístranný obchod, §17) vyplňuje pouze prostřední osoba. Ověřte, že jde skutečně o třístranný obchod — z účetních dat to odvodit nelze.`,
        row: i,
      })
    }

    if ((r.pln_hodnota ?? "") !== "" && !/^-?\d+$/.test(r.pln_hodnota ?? "")) {
      out.push({
        code: "HODNOTA_NENI_CELE_CISLO",
        severity: "error",
        message: `Řádek ${i + 1}: hodnota plnění musí být celé číslo v korunách.`,
        row: i,
      })
    }

    // "Žádné DIČ nesmí být v hlášení uvedeno více než jednou se stejným kódem plnění."
    if (!storno && stat !== "" && (r.c_vat ?? "") !== "") {
      const key = `${stat}|${r.c_vat}|${kod}`
      const first = seen.get(key)
      if (first !== undefined) {
        out.push({
          code: "DIC_DUPLICITNI",
          severity: "error",
          message: `Řádek ${i + 1}: stejné DIČ (${stat}${r.c_vat}) se stejným kódem plnění je již na řádku ${first + 1} — každá kombinace smí být v hlášení jen jednou.`,
          row: i,
        })
      } else {
        seen.set(key, i)
      }
    }
  })

  // "DIČ původního předpokládaného pořizovatele musí být uvedeno spolu s DIČ nového."
  ;(m.callOff ?? []).forEach((r, i) => {
    if (r.k_cos === "3" && (r.c_vat_puv ?? "") === "") {
      out.push({
        code: "COS_ZMENA_BEZ_PUVODNIHO",
        severity: "error",
        message: `Call-off stock, řádek ${i + 1}: u změny pořizovatele (kód 3) musí být uvedeno i DIČ původně předpokládaného pořizovatele.`,
      })
    }
  })

  if (forma === "R" && rows.length === 0 && (m.callOff ?? []).length === 0) {
    out.push({
      code: "PRAZDNE_HLASENI",
      severity: "warning",
      message:
        "Hlášení neobsahuje žádný řádek. Souhrnné hlášení se podává jen za období, ve kterém vznikla povinnost je podat (§102 odst. 1 ZDPH).",
    })
  }

  return out
}
