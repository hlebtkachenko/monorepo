import type { INestApplication } from "@nestjs/common"
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger"
import { cleanupOpenApiDoc } from "nestjs-zod"
import { V1Module } from "./v1/v1.module.js"

/**
 * Build the OpenAPI 3.1 document for the public `/v1` surface.
 *
 * Shared by `main.ts` (serves Swagger UI + the raw spec at runtime) and
 * `scripts/emit-openapi.ts` (writes the committed `openapi/v1.json` that CI
 * drift-gates and Spectral lints). `cleanupOpenApiDoc` is required to turn the
 * nestjs-zod markers into real component schemas.
 */
export function buildOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle("Afframe Public API")
    .setDescription(
      "Public API for the Afframe accounting platform. Authenticate with an " +
        "API key as a bearer token.",
    )
    .setVersion(process.env.BUILD_VERSION ?? "0.0.0")
    .addServer("https://api.afframe.com")
    .addBearerAuth({
      type: "http",
      scheme: "bearer",
      bearerFormat: "API key",
      description: "API key in the form affk_live_...",
    })
    .build()

  return cleanupOpenApiDoc(
    SwaggerModule.createDocument(app, config, { include: [V1Module] }),
  )
}
