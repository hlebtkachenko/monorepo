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

export type FilingType = "isdoc"

const REGISTRY: Record<string, () => SchemaSet> = {
  // isdoc-invoice includes isdoc-core; both preloaded so the relative include resolves.
  "isdoc@6.0.1": () => ({
    main: schema("isdoc/6.0.1/isdoc-invoice-6.0.1.xsd"),
    preload: [schema("isdoc/6.0.1/isdoc-core-6.0.1.xsd")],
  }),
}

/** Resolve the vendored schema set for a filing type + version, or throw if unregistered. */
export function resolveSchema(
  filingType: FilingType,
  version: string,
): SchemaSet {
  const key = `${filingType}@${version}`
  const load = REGISTRY[key]
  if (!load) throw new Error(`filing: no vendored schema registered for ${key}`)
  return load()
}
