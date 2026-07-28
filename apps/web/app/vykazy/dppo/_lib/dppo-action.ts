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
  type DppoPriloha,
  type DppoZadostSbirka,
  type DppoZaverka,
  type DppoCheck,
} from "@workspace/filing/dppo"
import { validateFiling } from "@workspace/filing"
import { ZodError } from "zod"

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
  priloha?: DppoPriloha,
  zaverka?: DppoZaverka,
  zadost?: DppoZadostSbirka,
): Promise<DppoActionResult> {
  try {
    const model = DppoSchema.parse(
      buildDppoFromAccounting(figures, meta, priloha, zaverka, zadost),
    )
    const xml = generateDppo(model)
    const checks = checkDppo(model)
    const xsd = await validateFiling(xml, "dppo", DPPO_VERSION)
    return {
      ok: true,
      xml,
      xsd: { valid: xsd.valid, errors: [...xsd.errors] },
      checks,
    }
  } catch (error) {
    // The cause is almost never the user's input: a Zod issue names the offending
    // field, and an xmllint-wasm failure is an environment problem no amount of
    // checking the form will fix. Swallowing it left both looking identical.
    console.error("[dppo] buildDppoXml failed", error)
    return { ok: false, error: describeDppoFailure(error) }
  }
}

/** Turn a thrown error into something that tells the user where to look. */
function describeDppoFailure(error: unknown): string {
  if (error instanceof ZodError) {
    const fields = error.issues
      .map((i) => i.path.join("."))
      .filter(Boolean)
      .join(", ")
    return fields
      ? `DPPO XML se nepodařilo vytvořit — neplatné hodnoty: ${fields}.`
      : "DPPO XML se nepodařilo vytvořit — zkontrolujte zadané hodnoty a povinná pole."
  }
  const message = error instanceof Error ? error.message : String(error)
  return `DPPO XML se nepodařilo vytvořit — chyba serveru: ${message}`
}
