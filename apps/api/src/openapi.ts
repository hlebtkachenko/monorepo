import { buildOpenApiDocument as buildFromRegistry } from "@workspace/shared/api"

/**
 * Build the OpenAPI 3.1 document for the public `/v1` surface.
 *
 * Thin delegate over the `@workspace/shared/api` registry. The registry —
 * not the `@nestjs/swagger` reflector — is the single source of truth for
 * the spec: every schema, route, response, server, and tag is authored in
 * `packages/shared/src/api/`. The api process and `scripts/emit-openapi.ts`
 * share this single emit path; SDK + MCP codegen reads the resulting
 * `apps/api/openapi/v1.json` file.
 *
 * The `@nestjs/swagger` decorators on the v1 controllers are intentionally
 * left in place; they are inert here (the reflector no longer runs) but
 * still document each route in IDEs and during code review. Phase B6's
 * `sdk-drift` gate keeps the committed spec aligned with the registry.
 */
export type ApiOpenApiDocument = ReturnType<typeof buildFromRegistry>

export function buildOpenApiDocument(): ApiOpenApiDocument {
  return buildFromRegistry({
    version: process.env.BUILD_VERSION ?? "0.0.0",
  })
}
