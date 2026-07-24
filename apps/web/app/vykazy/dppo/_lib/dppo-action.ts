"use server"

// Server action: assemble + serialize + XSD-validate the DPPO (DPPDP9) return.
// @workspace/filing runs here in the Node server, never in the client bundle —
// the pure pipeline (adapter + writer + checks) comes from the light
// "@workspace/filing/dppo" subpath, and the xmllint-wasm XSD validator
// (`validateFiling`, a root-barrel export) is pulled ONLY here on the server.
// Mirrors apps/web/app/fakturace/_lib/isdoc-action.ts.

import {
  buildDppoFromAccounting,
  generateDppo,
  checkDppo,
  DppoSchema,
  DPPO_VERSION,
  type DppoFigures,
  type DppoFilingMeta,
  type DppoCheck,
} from "@workspace/filing/dppo"
import { validateFiling } from "@workspace/filing"

export interface DppoActionResult {
  ok: boolean
  xml?: string
  /** XSD validation of the generated document — the hard download gate. */
  xsd?: { valid: boolean; errors: string[] }
  /** Warn-only business checks (never block). */
  checks?: DppoCheck[]
  error?: string
}

export async function buildDppoXml(
  figures: DppoFigures,
  meta: DppoFilingMeta,
): Promise<DppoActionResult> {
  try {
    const model = DppoSchema.parse(buildDppoFromAccounting(figures, meta))
    const xml = generateDppo(model)
    const checks = checkDppo(model)
    const xsd = await validateFiling(xml, "dppo", DPPO_VERSION)
    return {
      ok: true,
      xml,
      xsd: { valid: xsd.valid, errors: [...xsd.errors] },
      checks,
    }
  } catch {
    return {
      ok: false,
      error:
        "DPPO XML se nepodařilo vytvořit — zkontrolujte zadané hodnoty a povinná pole.",
    }
  }
}
