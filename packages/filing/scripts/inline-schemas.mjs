/* eslint-disable no-undef -- node build script (console/process are node globals) */
// Inline the vendored XSD files under schemas/ into src/validate/schemas.generated.ts
// so the validator carries the schema text as data (no runtime fs / no bundler asset
// resolution). Works identically in Node, vitest, Next dev/build, and the browser.
// Regenerate after adding or updating a vendored schema:
//   node packages/filing/scripts/inline-schemas.mjs

import { readFileSync, readdirSync, writeFileSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"

const here = dirname(fileURLToPath(import.meta.url))
const pkgRoot = join(here, "..")
const schemasDir = join(pkgRoot, "schemas")

/** Recursively collect every *.xsd under schemas/, keyed by its path relative to schemas/. */
function collect(dir) {
  const out = {}
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) Object.assign(out, collect(full))
    else if (entry.name.endsWith(".xsd"))
      out[relative(schemasDir, full)] = readFileSync(full, "utf8")
  }
  return out
}

const schemas = collect(schemasDir)
const entries = Object.keys(schemas)
  .sort()
  .map((k) => `  ${JSON.stringify(k)}: ${JSON.stringify(schemas[k])},`)
  .join("\n")

const body = `// AUTO-GENERATED from packages/filing/schemas/ — DO NOT EDIT.
// Regenerate: node packages/filing/scripts/inline-schemas.mjs
export const VENDORED_SCHEMAS: Record<string, string> = {
${entries}
}
`

writeFileSync(join(pkgRoot, "src", "validate", "schemas.generated.ts"), body)
console.log(
  `inlined ${entries ? Object.keys(schemas).length : 0} schema file(s)`,
)
