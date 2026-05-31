import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { buildOpenApiDocument } from "../src/openapi"

/**
 * Emit the committed OpenAPI 3.1 spec for the public `/v1` surface.
 *
 * Writes `apps/api/openapi/v1.json` straight from the shared registry — no
 * Nest boot, no controller reflection. CI (`openapi-lint.yml`) re-runs this
 * and fails on any diff; the committed spec must always match the registry
 * source in `packages/shared/src/api/`. Then Spectral lints it.
 *
 * Run: `pnpm --filter api emit:openapi`.
 */
function main(): void {
  const document = buildOpenApiDocument()
  const outDir = join(__dirname, "..", "openapi")
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    join(outDir, "v1.json"),
    JSON.stringify(document, null, 2) + "\n",
  )
  process.stdout.write("Wrote apps/api/openapi/v1.json\n")
}

try {
  main()
} catch (err) {
  console.error(err)
  process.exit(1)
}
