import type { ArgumentsHost } from "@nestjs/common"
import { HttpException, HttpStatus } from "@nestjs/common"
import { ThrottlerException } from "@nestjs/throttler"
import { describe, expect, it, vi } from "vitest"

import {
  API_ERROR_CODES,
  DomainError,
  ForbiddenError,
  NotFoundError,
} from "@workspace/shared/errors"
import { DomainExceptionFilter } from "./domain-exception.filter"

/** Build a fake ArgumentsHost capturing the response status + body. */
function makeHost(requestId = "req-test") {
  const json = vi.fn()
  const status = vi.fn(() => ({ json }))
  const host = {
    switchToHttp: () => ({
      getResponse: () => ({ status }),
      getRequest: () => ({ requestId }),
    }),
  } as unknown as ArgumentsHost
  return { host, status, json }
}

describe("DomainExceptionFilter", () => {
  const filter = new DomainExceptionFilter()

  it("maps a NotFoundError to 404 + the not_found envelope", () => {
    const { host, status, json } = makeHost()
    filter.catch(new NotFoundError("Organization not found"), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.NOT_FOUND)
    expect(json).toHaveBeenCalledWith({
      error: {
        code: "not_found",
        error_type: "NOT_FOUND",
        message: "Organization not found",
        requestId: "req-test",
      },
    })
  })

  it("emits the Plaid-shape envelope fields on every error", () => {
    const { host, json } = makeHost()
    filter.catch(new ForbiddenError(), host)
    const body = json.mock.calls[0]?.[0] as {
      error: Record<string, unknown>
    }
    expect(body.error).toMatchObject({
      code: "forbidden",
      error_type: "FORBIDDEN",
      requestId: "req-test",
    })
    expect(body.error.documentation_url).toBeUndefined()
  })

  it("maps a ForbiddenError to 403", () => {
    const { host, status, json } = makeHost()
    filter.catch(new ForbiddenError(), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.FORBIDDEN)
    expect(json.mock.calls[0]?.[0]).toMatchObject({
      error: { code: "forbidden" },
    })
  })

  it("maps a NestJS HttpException to its status + derived code", () => {
    const { host, status, json } = makeHost()
    filter.catch(new HttpException("nope", HttpStatus.UNAUTHORIZED), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.UNAUTHORIZED)
    expect(json.mock.calls[0]?.[0]).toMatchObject({
      error: { code: "unauthorized", message: "nope" },
    })
  })

  it("maps an unmapped 5xx HttpException to the INTERNAL family", () => {
    const { host, status, json } = makeHost()
    filter.catch(new HttpException("bad gateway", HttpStatus.BAD_GATEWAY), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_GATEWAY)
    expect(json.mock.calls[0]?.[0]).toMatchObject({
      error: {
        code: "internal_error",
        error_type: "INTERNAL",
        message: "bad gateway",
      },
    })
  })

  it("renders an unknown error as a generic 500", () => {
    const { host, status, json } = makeHost()
    filter.catch(new Error("boom"), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.INTERNAL_SERVER_ERROR)
    expect(json.mock.calls[0]?.[0]).toMatchObject({
      error: { code: "internal_error" },
    })
  })

  it("pins the 429 contract: ThrottlerException -> rate_limited envelope", () => {
    const { host, status, json } = makeHost()
    filter.catch(new ThrottlerException(), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.TOO_MANY_REQUESTS)
    expect(json).toHaveBeenCalledWith({
      error: {
        code: "rate_limited",
        error_type: "RATE_LIMITED",
        message:
          "Too many requests. See the RateLimit-* headers for the reset window.",
        requestId: "req-test",
      },
    })
  })

  it("coerces a DomainError with an unregistered code to bad_request", () => {
    const { host, status, json } = makeHost()
    filter.catch(new DomainError("not_in_the_registry", "made up"), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.BAD_REQUEST)
    expect(json.mock.calls[0]?.[0]).toMatchObject({
      error: { code: "bad_request", message: "made up" },
    })
  })

  it("maps an unmapped 4xx HttpException to bad_request (never an off-registry code)", () => {
    const { host, status, json } = makeHost()
    filter.catch(new HttpException("teapot", HttpStatus.I_AM_A_TEAPOT), host)
    expect(status).toHaveBeenCalledWith(HttpStatus.I_AM_A_TEAPOT)
    expect(json.mock.calls[0]?.[0]).toMatchObject({
      error: { code: "bad_request", error_type: "INVALID_REQUEST" },
    })
  })

  it("only ever emits codes from the API_ERROR_CODES registry", () => {
    const exceptions: unknown[] = [
      new NotFoundError(),
      new ForbiddenError(),
      new DomainError("rogue_code", "rogue"),
      new ThrottlerException(),
      new HttpException("nope", HttpStatus.UNAUTHORIZED),
      new HttpException("odd", HttpStatus.I_AM_A_TEAPOT),
      new HttpException("bad gateway", HttpStatus.BAD_GATEWAY),
      new Error("boom"),
    ]
    for (const exception of exceptions) {
      const { host, json } = makeHost()
      filter.catch(exception, host)
      const body = json.mock.calls[0]?.[0] as { error: { code: string } }
      expect(API_ERROR_CODES).toContain(body.error.code)
    }
  })

  it("falls back to requestId 'unknown' when the middleware did not run", () => {
    const json = vi.fn()
    const host = {
      switchToHttp: () => ({
        getResponse: () => ({ status: () => ({ json }) }),
        getRequest: () => ({}),
      }),
    } as unknown as ArgumentsHost
    filter.catch(new NotFoundError(), host)
    expect(json.mock.calls[0]?.[0]).toMatchObject({
      error: { requestId: "unknown" },
    })
  })
})
