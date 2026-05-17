import "reflect-metadata"
import { mkdirSync, writeFileSync } from "node:fs"
import { join } from "node:path"
import { VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { AppModule } from "../src/app.module"
import { buildOpenApiDocument } from "../src/openapi"

/**
 * Emit the committed OpenAPI 3.1 spec for the public `/v1` surface.
 *
 * Boots the Nest app with no HTTP listener, builds the document, and writes
 * `apps/api/openapi/v1.json`. CI (`openapi-lint.yml`) re-runs this and fails
 * on any diff — the committed spec must always match the code, then Spectral
 * lints it.
 *
 * Run: `pnpm --filter api emit:openapi`.
 */
async function main(): Promise<void> {
  const app = await NestFactory.create(AppModule, { logger: false })
  // Mirror main.ts: URI versioning must be enabled before the document is
  // built so the `/v1` prefix appears on the public routes.
  app.enableVersioning({ type: VersioningType.URI, prefix: "v" })
  const document = buildOpenApiDocument(app)
  await app.close()

  const outDir = join(__dirname, "..", "openapi")
  mkdirSync(outDir, { recursive: true })
  writeFileSync(
    join(outDir, "v1.json"),
    JSON.stringify(document, null, 2) + "\n",
  )
  process.stdout.write("Wrote apps/api/openapi/v1.json\n")
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
