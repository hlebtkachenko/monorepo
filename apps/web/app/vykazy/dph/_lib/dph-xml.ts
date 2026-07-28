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

import type { DphEvidence } from "./dph-evidence"
import {
  projectPriznani,
  projectKontrolniHlaseni,
  projectSouhrnneHlaseni,
  type DphOrgMeta,
} from "./dph-project"

export type DphFormKind = "priznani" | "kh" | "sh"

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

const VERSIONS: Record<DphFormKind, string> = {
  priznani: DPHDP3_VERSION,
  kh: DPHKH1_VERSION,
  sh: DPHSHV_VERSION,
}

const FILING_TYPE = {
  priznani: "dphdp3",
  kh: "dphkh1",
  sh: "dphshv",
} as const

/** Build one filing: project → parse → serialize → XSD-validate → business checks. */
export async function buildDphXml(
  kind: DphFormKind,
  evidence: DphEvidence,
  meta: DphOrgMeta,
  forma?: string,
): Promise<DphXmlResult> {
  try {
    let xml: string
    let checks: DphshvCheck[] = []

    if (kind === "priznani") {
      const model = Dphdp3Schema.parse(
        projectPriznani(evidence, meta, forma ?? "B"),
      )
      // ř.62–65 come from the filing engine's own derivation, never from the app.
      const { model: withTotals } = applyDphdp3Totals(model)
      xml = generateDphdp3(withTotals)
    } else if (kind === "kh") {
      const model = Dphkh1Schema.parse(
        projectKontrolniHlaseni(evidence, meta, forma ?? "B"),
      )
      xml = generateDphkh1(model)
    } else {
      const model = DphshvSchema.parse(
        projectSouhrnneHlaseni(evidence, meta, forma ?? "R"),
      )
      checks = checkDphshv(model)
      xml = generateDphshv(model)
    }

    // Lazy — keeps the WASM validator out of the initial bundle.
    const { validateFiling } = await import("@workspace/filing")
    const xsd = await validateFiling(xml, FILING_TYPE[kind], VERSIONS[kind])

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
  const prefix =
    kind === "priznani" ? "DPHDP3" : kind === "kh" ? "DPHKH1" : "DPHSHV"
  return `${prefix}-${e.rok}${obdobi ? `-${obdobi}` : ""}.xml`
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
