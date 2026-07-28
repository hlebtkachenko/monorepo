// Build + validate the three DPH documents ENTIRELY IN THE BROWSER.
//
// Deliberately not a "use server" action, unlike dppo-action.ts. A kontrolní
// hlášení is line-level personal data — every counterparty's DIČ, and for an OSVČ
// that DIČ is a rodné číslo — so posting it to the server to be serialized would
// send the most sensitive thing this tool touches over the wire, and put it in
// reach of server logs, for no benefit: the writers are pure string builders and
// xmllint-wasm ships a browser build (see @workspace/filing validate.ts, "Runs
// identically in Node and the browser"). Keeping it client-side also means
// /vykazy/dph adds no unauthenticated public endpoint to a login-free route.
//
// The XSD validator is imported lazily, on the first generate, so the ~1 MB WASM
// binary is not in the page's initial bundle.

import {
  generateDphdp3,
  generateDphkh1,
  generateDphshv,
  checkDphshv,
  applyDphdp3Totals,
  Dphdp3Schema,
  Dphkh1Schema,
  DphshvSchema,
  DPHDP3_VERSION,
  DPHKH1_VERSION,
  DPHSHV_VERSION,
  type DphshvCheck,
} from "@workspace/filing/dph"

import type { DphEvidence, DphFormKind } from "./dph-evidence"
import {
  projectPriznani,
  projectKontrolniHlaseni,
  projectSouhrnneHlaseni,
  type DphOrgMeta,
} from "./dph-project"

// Declared in dph-evidence so dph-project can take it without an import cycle.
export type { DphFormKind } from "./dph-evidence"

export interface DphXmlResult {
  ok: boolean
  xml?: string
  fileName?: string
  /** XSD validation of the generated document — the hard download gate. */
  xsd?: { valid: boolean; errors: string[] }
  /** Warn-only business checks (SH only for now). */
  checks?: DphshvCheck[]
  error?: string
}

/**
 * Everything that varies per filing, in ONE place.
 *
 * The forma ternary used to be duplicated byte-for-byte between this file and
 * dph-module.tsx: the dropdown and the writer each decided independently which
 * evidence field holds the druh podání and what its fallback is, so editing one
 * alone let the filer pick one and file another.
 */
export const DPH_KINDS: Record<
  DphFormKind,
  {
    title: string
    prefix: string
    version: string
    filingType: "dphdp3" | "dphkh1" | "dphshv"
    /** Each form's own alphabet — they do not overlap. */
    formy: { value: string; label: string }[]
    formaOf: (e: DphEvidence) => string
    withForma: (e: DphEvidence, v: string) => Partial<DphEvidence>
  }
> = {
  priznani: {
    title: "Přiznání k DPH (DPHDP3)",
    prefix: "DPHDP3",
    version: DPHDP3_VERSION,
    filingType: "dphdp3",
    formy: [
      { value: "B", label: "Řádné" },
      { value: "O", label: "Opravné (§ 138 DŘ — před uplynutím lhůty)" },
      { value: "D", label: "Dodatečné (§ 141 DŘ)" },
      { value: "E", label: "Opravné dodatečné" },
    ],
    formaOf: (e) => e.forma ?? "B",
    withForma: (_e, v) => ({ forma: v }),
  },
  kh: {
    title: "Kontrolní hlášení (DPHKH1)",
    prefix: "DPHKH1",
    version: DPHKH1_VERSION,
    filingType: "dphkh1",
    formy: [
      { value: "B", label: "Řádné (§ 101e)" },
      { value: "O", label: "Řádné/opravné (§ 101f odst. 1)" },
      { value: "N", label: "Následné (§ 101f odst. 2)" },
    ],
    formaOf: (e) => e.khForma ?? "B",
    withForma: (_e, v) => ({ khForma: v }),
  },
  sh: {
    title: "Souhrnné hlášení VIES (DPHSHV)",
    prefix: "DPHSHV",
    version: DPHSHV_VERSION,
    filingType: "dphshv",
    formy: [
      { value: "R", label: "Řádné" },
      { value: "N", label: "Následné (opravuje se storno řádky)" },
    ],
    formaOf: (e) => e.shForma ?? "R",
    withForma: (_e, v) => ({ shForma: v }),
  },
}

/** Build one filing: project → parse → serialize → XSD-validate → business checks. */
export async function buildDphXml(
  kind: DphFormKind,
  evidence: DphEvidence,
  meta: DphOrgMeta,
): Promise<DphXmlResult> {
  try {
    // Each form has its own alphabet and they do not overlap: přiznání B/O/D/E,
    // kontrolní hlášení B/O/N, souhrnné hlášení R/N. Reading one field for all
    // three would let a DPHDP3-style "B" reach the souhrnné hlášení.
    const forma = DPH_KINDS[kind].formaOf(evidence)
    let xml: string
    let checks: DphshvCheck[] = []

    if (kind === "priznani") {
      const model = Dphdp3Schema.parse(
        projectPriznani(evidence, meta, forma),
      )
      // ř.62–65 come from the filing engine's own derivation, never from the app.
      const { model: withTotals } = applyDphdp3Totals(model)
      xml = generateDphdp3(withTotals)
    } else if (kind === "kh") {
      const model = Dphkh1Schema.parse(
        projectKontrolniHlaseni(evidence, meta, forma),
      )
      xml = generateDphkh1(model)
    } else {
      const model = DphshvSchema.parse(
        projectSouhrnneHlaseni(evidence, meta, forma),
      )
      checks = checkDphshv(model)
      xml = generateDphshv(model)
    }

    // Lazy — keeps the WASM validator out of the initial bundle.
    const { validateFiling } = await import("@workspace/filing")
    const { filingType, version } = DPH_KINDS[kind]
    const xsd = await validateFiling(xml, filingType, version)

    return {
      ok: true,
      xml,
      fileName: fileNameFor(kind, evidence),
      xsd: { valid: xsd.valid, errors: [...xsd.errors] },
      checks,
    }
  } catch (error) {
    return { ok: false, error: describeFailure(error) }
  }
}

function fileNameFor(kind: DphFormKind, e: DphEvidence): string {
  const obdobi =
    kind === "kh"
      ? (e.khMesic ?? e.mesic ?? "")
      : kind === "sh"
        ? (e.shMesic ?? e.mesic ?? e.shCtvrt ?? e.ctvrt ?? "")
        : (e.mesic ?? e.ctvrt ?? "")
  return `${DPH_KINDS[kind].prefix}-${e.rok}${obdobi ? `-${obdobi}` : ""}.xml`
}

function describeFailure(error: unknown): string {
  // Never log the error object: on a kontrolní hlášení a Zod issue path can carry
  // counterparty data, and this runs in the user's browser where the console is
  // shared with anything else on the page.
  if (error instanceof Error && error.name === "ZodError") {
    return "XML se nepodařilo vytvořit — některé hodnoty nemají platný tvar. Zkontrolujte DIČ, data a částky v evidenci."
  }
  return "XML se nepodařilo vytvořit. Zkontrolujte zadané hodnoty v evidenci."
}

/** Trigger a browser download of the generated document. */
export function downloadXml(xml: string, fileName: string): void {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}
