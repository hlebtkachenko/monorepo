import type { ArgumentsHost } from "@nestjs/common"
import { HttpException, HttpStatus } from "@nestjs/common"
import { describe, expect, it, vi } from "vitest"

import { ForbiddenError, NotFoundError } from "@workspace/shared/errors"
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
