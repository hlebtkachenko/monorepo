import { join } from "node:path"
import { VersioningType } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import type { NestExpressApplication } from "@nestjs/platform-express"
import * as Sentry from "@sentry/node"
import express from "express"
import helmet from "helmet"
import { AppModule } from "./app.module"
import { registerDocsRoutes } from "./docs"
import { registerEditorRoutes } from "./editor"
import { buildOpenApiDocument } from "./openapi"
import { registerVoidRoutes } from "./void"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0,
  release: process.env.BUILD_VERSION,
  environment: process.env.NODE_ENV,
})

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule)

  // Graceful shutdown: ECS sends SIGTERM on deploy/scale-in; without
  // shutdown hooks Nest never closes the HTTP server and in-flight
  // requests are dropped at task kill instead of drained.
  app.enableShutdownHooks()

  // Trust exactly one proxy hop. Per ADR-0008 the only path to this
  // process is the cloudflared sidecar on loopback: client -> Cloudflare
  // edge (appends the real client IP to X-Forwarded-For) -> tunnel ->
  // cloudflared (passes the edge-set headers through) -> this listener. Without this, `req.ip` is always
  // the sidecar's loopback address, so ALL unauthenticated traffic
  // (/v1/status, /v1/feedback) shares ONE throttler bucket — a single
  // anonymous spammer can 429 every legitimate anonymous caller. With one
  // trusted hop Express takes the last X-Forwarded-For entry (the value
  // cloudflared appended), which a client cannot spoof through the tunnel.
  app.set("trust proxy", 1)

  // CSP stays on helmet's strict defaults, with one relaxation: Scalar's
  // docs page boots from the jsDelivr CDN and runs an inline
  // `Scalar.createApiReference(...)` initializer, so `script-src` adds the
  // CDN host plus `'unsafe-inline'`. Everything else this process serves is
  // JSON, so no further directive widening is needed.
  //
  // Helmet registered FIRST so its security headers (X-Content-Type-Options,
  // X-Frame-Options, HSTS, CSP) attach to the brand asset responses below.
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          "script-src": [
            "'self'",
            "'unsafe-inline'",
            "https://cdn.jsdelivr.net",
          ],
        },
      },
    }),
  )

  // JSON + urlencoded body parsing for `/v1/*` POST endpoints. Nest's
  // default body-parser registration depends on init order with the
  // helmet/static-assets middleware; mounting explicitly here guarantees
  // controller `@Body()` receives a parsed object. 100 KB matches the
  // existing `/void/*` cap and is plenty for a feedback / future
  // resource payload.
  app.use(express.json({ limit: "100kb" }))
  app.use(express.urlencoded({ extended: true, limit: "100kb" }))

  // Brand assets (favicon, manifest, PWA icons) served from apps/api/public.
  // Resolved against process.cwd() so it works both in dev (cwd = apps/api)
  // and in the production image (cwd = /app, public copied via Dockerfile).
  app.useStaticAssets(join(process.cwd(), "public"))

  // URI versioning: public controllers carry `version: "1"` -> `/v1/*`.
  // The health controller is VERSION_NEUTRAL and stays at `/api/health`.
  app.enableVersioning({ type: VersioningType.URI, prefix: "v" })

  // Public API docs — available in production (this documents a public API).
  // Scalar API Reference at `/`, raw OpenAPI 3.1 spec at `/v1/openapi.json`.
  // The document is built from the shared registry (see `openapi.ts`); the
  // Nest app instance is no longer required to emit it.
  const document = buildOpenApiDocument()
  registerDocsRoutes(app, document)
  registerEditorRoutes(app)
  registerVoidRoutes(app)

  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? "0.0.0.0"
  await app.listen(port, host)
}

void bootstrap()
