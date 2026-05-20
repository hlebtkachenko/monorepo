import type { INestApplication } from "@nestjs/common"
import type { OpenAPIObject } from "@nestjs/swagger"
import { apiReference } from "@scalar/nestjs-api-reference"
import type { Request, Response } from "express"

/**
 * Public API docs routes for the `/v1` surface (AFF-220).
 *
 * - `GET /v1/openapi.json` — raw OpenAPI 3.1 spec, the canonical
 *   machine-readable doc consumed by CI drift checks, Spectral, and any
 *   external SDK generator.
 * - `GET /v1/docs` — Scalar API Reference, a single-page interactive viewer.
 *   Scalar receives the document inline (no extra round-trip) and the
 *   renderer bootstraps from the jsDelivr CDN.
 *
 * Replaces the previous `SwaggerModule.setup(...)` UI mount. The OpenAPI
 * document is still produced by `buildOpenApiDocument` via nestjs-swagger;
 * only the UI layer changed.
 */
export function registerDocsRoutes(
  app: INestApplication,
  document: OpenAPIObject,
): void {
  app
    .getHttpAdapter()
    .get("/v1/openapi.json", (_req: Request, res: Response) => {
      res.type("application/json").send(document)
    })

  app.use(
    "/v1/docs",
    apiReference({
      content: document,
      pageTitle: "Afframe Public API · Reference",
    }),
  )
}
