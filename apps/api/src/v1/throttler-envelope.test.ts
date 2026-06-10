import {
  Controller,
  Get,
  type INestApplication,
  Module,
  VersioningType,
} from "@nestjs/common"
import { APP_FILTER, APP_GUARD } from "@nestjs/core"
import { ThrottlerModule } from "@nestjs/throttler"
import { Test } from "@nestjs/testing"
import supertest from "supertest"
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import { ApiKeyThrottlerGuard } from "./api-key-throttler.guard"
import { DomainExceptionFilter } from "./domain-exception.filter"

/**
 * Pins the public 429 contract end-to-end (docs/api/RATE-LIMITS.md §1-2):
 * the throttled response must carry the Plaid-shape `rate_limited` envelope
 * PLUS the IETF `RateLimit-*` headers and `Retry-After`. Boots a real Nest
 * app over HTTP with the production guard + global filter wiring — the same
 * `APP_GUARD`/`APP_FILTER` providers `V1Module` registers.
 */

@Controller({ path: "throttle-probe", version: "1" })
class ProbeController {
  @Get()
  probe(): { ok: true } {
    return { ok: true }
  }
}

@Module({
  imports: [ThrottlerModule.forRoot([{ ttl: 60_000, limit: 2 }])],
  controllers: [ProbeController],
  providers: [
    { provide: APP_GUARD, useClass: ApiKeyThrottlerGuard },
    { provide: APP_FILTER, useClass: DomainExceptionFilter },
  ],
})
class ProbeModule {}

describe("429 rate-limit contract (envelope + headers)", () => {
  let app: INestApplication

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile()
    app = moduleRef.createNestApplication()
    app.enableVersioning({ type: VersioningType.URI, prefix: "v" })
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  it("serves the standard error envelope + RateLimit-*/Retry-After on 429", async () => {
    const http = supertest(app.getHttpServer())

    // Exhaust the 2-request window (single ip bucket — no bearer token).
    await http.get("/v1/throttle-probe").expect(200)
    await http.get("/v1/throttle-probe").expect(200)

    const res = await http
      .get("/v1/throttle-probe")
      .expect(429)
      .expect("Content-Type", /application\/json/)

    expect(res.body).toEqual({
      error: {
        code: "rate_limited",
        error_type: "RATE_LIMITED",
        message:
          "Too many requests. See the RateLimit-* headers for the reset window.",
        requestId: "unknown",
      },
    })

    // IETF draft-ietf-httpapi-ratelimit-headers names (NOT X-RateLimit-*).
    expect(Number(res.headers["retry-after"])).toBeGreaterThan(0)
    expect(res.headers["ratelimit-limit"]).toBe("2")
    expect(res.headers["ratelimit-remaining"]).toBe("0")
    expect(Number(res.headers["ratelimit-reset"])).toBeGreaterThan(0)
    expect(res.headers["x-ratelimit-limit"]).toBeUndefined()
  })

  it("2xx responses carry the live RateLimit-* quota headers", async () => {
    // Fresh app instance: the previous test consumed the shared bucket.
    const moduleRef = await Test.createTestingModule({
      imports: [ProbeModule],
    }).compile()
    const freshApp = moduleRef.createNestApplication()
    freshApp.enableVersioning({ type: VersioningType.URI, prefix: "v" })
    await freshApp.init()
    try {
      const res = await supertest(freshApp.getHttpServer())
        .get("/v1/throttle-probe")
        .expect(200)
      expect(res.headers["ratelimit-limit"]).toBe("2")
      expect(res.headers["ratelimit-remaining"]).toBe("1")
    } finally {
      await freshApp.close()
    }
  })
})
