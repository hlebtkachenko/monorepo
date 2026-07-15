import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from "@nestjs/common"
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core"
import { ThrottlerModule } from "@nestjs/throttler"
import { ZodValidationPipe } from "nestjs-zod"
import { AccountingController } from "./accounting/accounting.controller"
import { AccountingWritesController } from "./accounting/accounting-writes.controller"
import { HeldWritesController } from "./accounting/held-writes.controller"
import { InvoicesController } from "./invoices/invoices.controller"
import { AccountsController } from "./accounts/accounts.controller"
import { BookingTemplatesController } from "./booking-templates/booking-templates.controller"
import { ApiKeyThrottlerGuard } from "./api-key-throttler.guard"
import { DomainExceptionFilter } from "./domain-exception.filter"
import { FeedbackController } from "./feedback/feedback.controller"
import { OcrTemplatesController } from "./ocr-templates/ocr-templates.controller"
import { DocumentsController } from "./documents/documents.controller"
import { OnboardingController } from "./onboarding/onboarding.controller"
import { OrganizationController } from "./organization/organization.controller"
import { PingController } from "./ping/ping.controller"
import { RequestIdMiddleware } from "./request-id.middleware"
import { StaleHeldWritesScheduler } from "./accounting/stale-held-writes-scheduler"
import { StatusController } from "./status/status.controller"
import { StructureController } from "./structure/structure.controller"

// A non-integer / non-positive override would be nonsensical for a rate
// limit, so fall back to the documented default rather than admit an absurd
// (or zero/negative, which nestjs-throttler would misbehave on) value.
const positiveInt = (raw: string | undefined, dflt: number): number => {
  const n = Number(raw)
  return Number.isInteger(n) && n > 0 ? n : dflt
}
// Defaults here are the SAFE fallback (matches the long-standing hardcoded
// value) for any environment that doesn't set the env var (local dev, tests).
// The raised pre-launch value is set via CDK task-def env
// (infra/cdk/lib/app-stack.ts) — see V1_THROTTLE_LIMIT / V1_THROTTLE_TTL_MS.
const THROTTLE_LIMIT = positiveInt(process.env["V1_THROTTLE_LIMIT"], 100)
const THROTTLE_TTL_MS = positiveInt(process.env["V1_THROTTLE_TTL_MS"], 60_000)

/**
 * Public API surface — `api.afframe.com/v1/*`.
 *
 * - ThrottlerModule: `V1_THROTTLE_LIMIT` req / `V1_THROTTLE_TTL_MS` ms
 *   (default 100 req / 60 s; in-memory; single Fargate task per ADR-0008).
 *   ApiKeyThrottlerGuard keys the limit on the API key, not the client IP —
 *   behind the Cloudflare Tunnel every request shares the sidecar's loopback
 *   IP, so per-key is the only meaningful bucket.
 * - DomainExceptionFilter: registered as a GLOBAL filter (`APP_FILTER`) so
 *   every controller-routed error — including one thrown by a guard, and
 *   any future controller that forgets a decorator — renders the standard
 *   envelope. The version-neutral `/api/health` route is covered too (its
 *   happy path is untouched; only error responses gain the envelope). Raw
 *   express routes (`docs.ts`, `editor.ts`, `void.ts`) sit outside Nest's
 *   exception layer and are unaffected.
 * - ZodValidationPipe: validates any `createZodDto` request param against its
 *   Zod schema. Inert on the foundation's input-free GET endpoints.
 * - RequestIdMiddleware: per-request `X-Request-Id` on the v1 routes.
 * - StaleHeldWritesScheduler: recurring caller for the stale held-write queue
 *   alert (`accounting/stale-held-writes-alert.ts`); dormant unless
 *   `ACCOUNTING_STALE_HELD_ALERT_ENABLED=true`.
 *
 * API-key auth stays per-controller (`@UseGuards`) so public endpoints
 * (`/v1/status`, `/v1/feedback`) and `/api/health` remain key-free.
 */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: THROTTLE_TTL_MS, limit: THROTTLE_LIMIT }]),
  ],
  controllers: [
    PingController,
    OrganizationController,
    StatusController,
    FeedbackController,
    StructureController,
    AccountingController,
    AccountingWritesController,
    HeldWritesController,
    InvoicesController,
    AccountsController,
    OcrTemplatesController,
    DocumentsController,
    BookingTemplatesController,
    OnboardingController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyThrottlerGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    StaleHeldWritesScheduler,
  ],
})
export class V1Module implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer
      .apply(RequestIdMiddleware)
      .forRoutes(
        PingController,
        OrganizationController,
        StatusController,
        FeedbackController,
        StructureController,
        AccountingController,
        AccountingWritesController,
        HeldWritesController,
        InvoicesController,
        AccountsController,
        OcrTemplatesController,
        DocumentsController,
        BookingTemplatesController,
        OnboardingController,
      )
  }
}
