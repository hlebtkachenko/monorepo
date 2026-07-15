// XSD validation via xmllint-wasm (WASM libxml2). Runs identically in Node and the
// browser, so the same call powers CI, the server, and a future offline-UI pre-check.

import { validateXML } from "xmllint-wasm"
import { resolveSchema, type FilingType } from "./registry"

export interface FilingValidationResult {
  readonly valid: boolean
  readonly errors: readonly string[]
}

/**
 * Validate a generated filing document against its official vendored XSD.
 * xmllint-wasm only accepts UTF-8 input (ISDOC + EPO2 are both UTF-8).
 */
export async function validateFiling(
  xml: string,
  filingType: FilingType,
  version: string,
): Promise<FilingValidationResult> {
  const { main, preload } = resolveSchema(filingType, version)
  const result = await validateXML({
    xml: [{ fileName: "filing.xml", contents: xml }],
    schema: [{ fileName: main.fileName, contents: main.contents }],
    preload: preload.map((p) => ({
      fileName: p.fileName,
      contents: p.contents,
    })),
  })
  return {
    valid: result.valid,
    errors: result.errors.map((e) => e.message),
  }
}
