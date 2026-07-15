// Vendored-schema registry: maps a (filingType, version) pair to the official XSD
// files, carried as inlined data (see schemas.generated.ts, produced from
// packages/filing/schemas/ by scripts/inline-schemas.mjs). No runtime fs and no
// bundler asset resolution, so this works identically in Node, vitest, Next
// (dev/build), and the browser. Never fetch schemas at runtime.

import { VENDORED_SCHEMAS } from "./schemas.generated"

export interface SchemaFile {
  readonly fileName: string
  readonly contents: string
}

export interface SchemaSet {
  /** The main schema xmllint validates against. */
  readonly main: SchemaFile
  /** Additional schema files (xs:include / xs:import targets) preloaded into the FS. */
  readonly preload: readonly SchemaFile[]
}

function schema(relPath: string): SchemaFile {
  const contents = VENDORED_SCHEMAS[relPath]
  if (contents === undefined) {
    throw new Error(`filing: vendored schema not found: ${relPath}`)
  }
  return { fileName: relPath.split("/").pop() ?? relPath, contents }
}

export type FilingType = "isdoc" | "dphdp3" | "dphkh1" | "dppo"

/** Vendored-schema paths for one (filingType, version): the main XSD + its includes. */
interface SchemaSpec {
  readonly main: string
  readonly preload: readonly string[]
}

// A Map of DATA, not thunks: the lookup key embeds the caller-supplied `version`, so the
// registry must never let user input select a FUNCTION that then gets invoked (that is
// the `js/unvalidated-dynamic-method-call` sink). Here the values are plain path specs;
// `resolveSchema` looks one up and calls the FIXED `schema()` — nothing dynamically
// dispatched. Map.get also never walks the prototype chain (no `toString`/`constructor`).
const REGISTRY = new Map<string, SchemaSpec>([
  // isdoc-invoice includes isdoc-core; both preloaded so the relative include resolves.
  [
    "isdoc@6.0.1",
    {
      main: "isdoc/6.0.1/isdoc-invoice-6.0.1.xsd",
      preload: ["isdoc/6.0.1/isdoc-core-6.0.1.xsd"],
    },
  ],
  // FÚ EPO — single-file, self-contained schemas (no xs:include/import).
  [
    "dphdp3@03.01.03",
    { main: "fu/dphdp3/03.01.03/dphdp3_epo2.xsd", preload: [] },
  ],
  [
    "dphkh1@03.01.14",
    { main: "fu/dphkh1/03.01.14/dphkh1_epo2.xsd", preload: [] },
  ],
  // DPPO — Přiznání k dani z příjmů právnických osob (za období 2021–2026).
  ["dppo@05.01.01", { main: "fu/dppo/05.01.01/dppdp9_epo2.xsd", preload: [] }],
])

/** Resolve the vendored schema set for a filing type + version, or throw if unregistered. */
export function resolveSchema(
  filingType: FilingType,
  version: string,
): SchemaSet {
  const key = `${filingType}@${version}`
  const spec = REGISTRY.get(key)
  if (!spec) throw new Error(`filing: no vendored schema registered for ${key}`)
  return { main: schema(spec.main), preload: spec.preload.map(schema) }
}
