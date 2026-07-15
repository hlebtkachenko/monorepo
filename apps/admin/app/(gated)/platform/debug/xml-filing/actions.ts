"use server"

// Server actions for the XML-filing operator debug tool. @workspace/filing runs here
// in the Node server (xmllint-wasm validates against the vendored official XSDs), never
// in the client. Operator-facing, prod-live (admin is staff-only), not dev-gated.

import {
  readDppo,
  generateDppo,
  applyDppoTotals,
  checkDppo,
  readDphdp3,
  generateDphdp3,
  readDphkh1,
  generateDphkh1,
  readIsdoc,
  generateIsdoc,
  validateFiling,
  DPPO_VERSION,
  DPHDP3_VERSION,
  DPHKH1_VERSION,
  type DppoCheck,
} from "@workspace/filing"

export type FilingFormat = "dppo" | "dphdp3" | "dphkh1" | "isdoc"

const ISDOC_VERSION = "6.0.1"

const VERSIONS: Record<FilingFormat, string> = {
  dppo: DPPO_VERSION,
  dphdp3: DPHDP3_VERSION,
  dphkh1: DPHKH1_VERSION,
  isdoc: ISDOC_VERSION,
}

const LABELS: Record<FilingFormat, string> = {
  dppo: "DPPO — Přiznání k dani z příjmů právnických osob (DPPDP9)",
  dphdp3: "DPHDP3 — Přiznání k DPH",
  dphkh1: "DPHKH1 — Kontrolní hlášení",
  isdoc: "ISDOC 6.0.1 — faktura",
}

/** Detect the filing format from the document root element (server-internal). */
async function detectFormat(xml: string): Promise<FilingFormat | null> {
  if (/<DPPDP9[\s/>]/.test(xml)) return "dppo"
  if (/<DPHDP3[\s/>]/.test(xml)) return "dphdp3"
  if (/<DPHKH1[\s/>]/.test(xml)) return "dphkh1"
  if (/<Invoice[\s/>]/.test(xml)) return "isdoc"
  return null
}

/** Read → typed model, re-generate the canonical XML for a given format. */
function roundtrip(
  format: FilingFormat,
  xml: string,
): {
  model: unknown
  out: string
  warnings: DppoCheck[]
} {
  switch (format) {
    case "dppo": {
      const model = readDppo(xml)
      const { model: withTotals } = applyDppoTotals(model)
      return {
        model,
        out: generateDppo(withTotals),
        warnings: checkDppo(withTotals),
      }
    }
    case "dphdp3": {
      const model = readDphdp3(xml)
      return { model, out: generateDphdp3(model), warnings: [] }
    }
    case "dphkh1": {
      const model = readDphkh1(xml)
      return { model, out: generateDphkh1(model), warnings: [] }
    }
    case "isdoc": {
      const model = readIsdoc(xml)
      return { model, out: generateIsdoc(model), warnings: [] }
    }
  }
}

export interface FilingInspectResult {
  format: FilingFormat
  label: string
  version: string
  /** XSD validity of the RE-GENERATED document (the engine's own output). */
  valid: boolean
  errors: string[]
  /** DPPO kritické kontroly (warn-only); empty for other formats. */
  warnings: DppoCheck[]
  /** read → generate → read → generate is byte-identical (lossless). */
  idempotent: boolean
  /** The re-serialized document (import → export). */
  outputXml: string
  /** The parsed typed model, as pretty JSON (what the engine extracted). */
  modelJson: string
}

/**
 * Import an XML filing document, round-trip it through the typed engine, XSD-validate
 * the regenerated output, and (for DPPO) run the kritické kontroly. Returns everything
 * the operator needs to see whether the engine reads/writes/validates the document.
 * `format` may be forced; omit it to auto-detect from the root element.
 */
export async function inspectFilingAction(
  xml: string,
  forced?: FilingFormat,
): Promise<
  { ok: true; result: FilingInspectResult } | { ok: false; error: string }
> {
  const format = forced ?? (await detectFormat(xml))
  if (!format) {
    return {
      ok: false,
      error:
        "Neznámý formát — očekávám <Pisemnost><DPPDP9|DPHDP3|DPHKH1> nebo ISDOC <Invoice>.",
    }
  }
  let rt: { model: unknown; out: string; warnings: DppoCheck[] }
  try {
    rt = roundtrip(format, xml)
  } catch (err) {
    return { ok: false, error: `Nelze načíst jako ${format.toUpperCase()}: ${(err as Error).message}` } // prettier-ignore
  }
  const version = VERSIONS[format]
  const result = await validateFiling(rt.out, format, version)
  // Idempotency: parse the regenerated doc and generate again — must be byte-identical.
  let idempotent: boolean
  try {
    idempotent = roundtrip(format, rt.out).out === rt.out
  } catch {
    idempotent = false
  }
  return {
    ok: true,
    result: {
      format,
      label: LABELS[format],
      version,
      valid: result.valid,
      errors: [...result.errors],
      warnings: rt.warnings,
      idempotent,
      outputXml: rt.out,
      modelJson: JSON.stringify(rt.model, null, 2),
    },
  }
}
