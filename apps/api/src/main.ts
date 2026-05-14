import { NestFactory } from "@nestjs/core"
import * as Sentry from "@sentry/node"
import { AppModule } from "./app.module.js"

// Sentry must be initialised before any other instrumentation so the SDK can
// hook unhandled exception + promise rejection handlers at module load. The
// `enabled` guard turns the SDK into a noop when SENTRY_DSN is not provided,
// which is the default for local dev and unit tests. tracesSampleRate stays at
// 0 at MVP per `.context/decision-observability-mvp.md` (errors only, traces
// deferred to Honeycomb when ADR-0002 trip-wire fires).
Sentry.init({
  dsn: process.env.SENTRY_DSN,
  enabled: Boolean(process.env.SENTRY_DSN),
  tracesSampleRate: 0,
  release: process.env.BUILD_VERSION,
  environment: process.env.NODE_ENV,
})

async function bootstrap() {
  const app = await NestFactory.create(AppModule)
  app.setGlobalPrefix("api")
  const port = Number(process.env.PORT ?? 3001)
  const host = process.env.HOST ?? "0.0.0.0"
  await app.listen(port, host)
}

bootstrap()
