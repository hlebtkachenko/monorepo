import {
  type MiddlewareConsumer,
  Module,
  type NestModule,
} from "@nestjs/common"
import { APP_GUARD, APP_PIPE } from "@nestjs/core"
import { ThrottlerModule } from "@nestjs/throttler"
import { ZodValidationPipe } from "nestjs-zod"
import { ApiKeyThrottlerGuard } from "./api-key-throttler.guard"
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
 * - ZodValidationPipe: validates any `createZodDto` request param against its
 *   Zod schema. Inert on the foundation's input-free GET endpoints.
 * - RequestIdMiddleware: per-request `X-Request-Id` on the v1 routes.
 *
 * API-key auth + the error-envelope filter are applied per-controller
 * (`@UseGuards` / `@UseFilters`) so the version-neutral `/api/health` route
 * stays open and unwrapped.
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
