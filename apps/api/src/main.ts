import { join } from "node:path"
import { VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"
import { SwaggerModule } from "@nestjs/swagger"
import * as Sentry from "@sentry/node"
import helmet from "helmet"
import enMessages from "@workspace/i18n/messages/en.json"
import { AppModule } from "./app.module"
import { buildOpenApiDocument } from "./openapi"

// Brand name read from the i18n source of truth at bootstrap time. NestJS
// has no i18n runtime here (Swagger UI is English-only by design — it's a
// developer-facing API doc surface), so JSON import is the cleanest path.
const BRAND_NAME = enMessages.brand.name

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0,
  release: process.env.BUILD_VERSION,
  environment: process.env.NODE_ENV,
})

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  // CSP stays enabled (helmet's strict defaults), with one relaxation:
  // SwaggerModule injects an inline initializer <script> on /v1/docs and
  // `script-src 'self'` would block it. helmet's default style-src already
  // allows 'unsafe-inline' and img-src allows data:, which covers the rest
  // of the Swagger UI assets. Everything else this process serves is JSON.
  //
  // Helmet registered FIRST so its security headers (X-Content-Type-Options,
  // X-Frame-Options, HSTS, CSP) attach to the brand asset responses below.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": ["'self'", "'unsafe-inline'"],
        },
      },
    }),
  )

  // Brand assets (favicon, manifest, PWA icons) served from apps/api/public.
  // Resolved against process.cwd() so it works both in dev (cwd = apps/api)
  // and in the production image (cwd = /app, public copied via Dockerfile).
  app.useStaticAssets(join(process.cwd(), "public"))

  // URI versioning: public controllers carry `version: "1"` -> `/v1/*`.
  // The health controller is VERSION_NEUTRAL and stays at `/api/health`.
  app.enableVersioning({ type: VersioningType.URI, prefix: "v" })

  // Public API docs — available in production (this documents a public API).
  // Swagger UI at /v1/docs, raw OpenAPI 3.1 spec at /v1/openapi.json.
  const document = buildOpenApiDocument(app)
  SwaggerModule.setup("v1/docs", app, document, {
    jsonDocumentUrl: "v1/openapi.json",
    customSiteTitle: `${BRAND_NAME} API`,
    customfavIcon: "/favicon.svg",
  })

  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? "0.0.0.0"
  await app.listen(port, host)
}

void bootstrap()
