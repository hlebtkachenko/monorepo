import { VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { SwaggerModule } from "@nestjs/swagger"
import * as Sentry from "@sentry/node"
import helmet from "helmet"
import { AppModule } from "./app.module"
import { buildOpenApiDocument } from "./openapi"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0,
  release: process.env.BUILD_VERSION,
  environment: process.env.NODE_ENV,
})

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // contentSecurityPolicy disabled: the only HTML this process serves is the
  // Swagger UI docs page (inline scripts/styles). Everything else is JSON.
  app.use(helmet({ contentSecurityPolicy: false }))

  // URI versioning: public controllers carry `version: "1"` -> `/v1/*`.
  // The health controller is VERSION_NEUTRAL and stays at `/api/health`.
  app.enableVersioning({ type: VersioningType.URI, prefix: "v" })

  // Public API docs — available in production (this documents a public API).
  // Swagger UI at /v1/docs, raw OpenAPI 3.1 spec at /v1/openapi.json.
  const document = buildOpenApiDocument(app)
  SwaggerModule.setup("v1/docs", app, document, {
    jsonDocumentUrl: "v1/openapi.json",
  })

  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? "0.0.0.0"
  await app.listen(port, host)
}

bootstrap()
