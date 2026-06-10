import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from "@nestjs/common"
import { APP_FILTER, APP_GUARD, APP_PIPE } from "@nestjs/core"
import { ThrottlerModule } from "@nestjs/throttler"
import { ZodValidationPipe } from "nestjs-zod"
import { ApiKeyThrottlerGuard } from "./api-key-throttler.guard"
import { DomainExceptionFilter } from "./domain-exception.filter"
import { FeedbackController } from "./feedback/feedback.controller"
import { OrganizationController } from "./organization/organization.controller"
import { PingController } from "./ping/ping.controller"
import { RequestIdMiddleware } from "./request-id.middleware"
import { StatusController } from "./status/status.controller"

/**
 * Public API surface — `api.afframe.com/v1/*`.
 *
 * - ThrottlerModule: 100 req / 60 s (in-memory; single Fargate task per
 *   ADR-0008). ApiKeyThrottlerGuard keys the limit on the API key, not the
 *   client IP — behind the Cloudflare Tunnel every request shares the
 *   sidecar's loopback IP, so per-key is the only meaningful bucket.
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
 *
 * API-key auth stays per-controller (`@UseGuards`) so public endpoints
 * (`/v1/status`, `/v1/feedback`) and `/api/health` remain key-free.
 */
@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 100 }])],
  controllers: [
    PingController,
    OrganizationController,
    StatusController,
    FeedbackController,
  ],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyThrottlerGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
    { provide: APP_PIPE, useClass: ZodValidationPipe },
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
      )
  }
}
