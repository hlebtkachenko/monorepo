import { describe, expect, it } from "vitest"

import {
  API_ERROR_CODES,
  ConflictError,
  FeatureNotEnabledError,
  ForbiddenError,
  IdempotencyConflictError,
  NotFoundError,
  PayloadTooLargeError,
  RateLimitedError,
  StaleResourceError,
  UnauthorizedError,
  ValidationError,
} from "../errors"
import { ApiErrorSchema } from "./common"
import { buildOpenApiDocument } from "./registry"

describe("ApiErrorSchema.code single source (API_ERROR_CODES)", () => {
  it("emits the full API_ERROR_CODES registry as the OpenAPI Error.code enum", () => {
    const doc = buildOpenApiDocument()
    const schemas = doc.components?.schemas as Record<
      string,
      { properties?: Record<string, unknown> }
    >
    const error = schemas.ApiError?.properties?.error as {
      properties?: { code?: { enum?: string[] } }
    }
    expect(error?.properties?.code?.enum).toEqual([...API_ERROR_CODES])
  })

  it("every DomainError subclass code is registered in API_ERROR_CODES", () => {
    const thrown = [
      new NotFoundError(),
      new ForbiddenError(),
      new UnauthorizedError(),
      new ConflictError(),
      new ValidationError(),
      new RateLimitedError(),
      new IdempotencyConflictError(),
      new StaleResourceError(),
      new FeatureNotEnabledError(),
      new PayloadTooLargeError(),
    ]
    for (const err of thrown) {
      expect(API_ERROR_CODES).toContain(err.code)
    }
  })

  it("runtime validation stays lenient — an unknown future code still parses", () => {
    // Forward compatibility: adding a code is a MINOR contract change
    // (docs/api/ERRORS.md §3). Older SDK builds safeParse the envelope and
    // must not reject a newer server's code.
    const result = ApiErrorSchema.safeParse({
      error: {
        code: "invoice_already_finalized",
        message: "Invoice is already finalized.",
        requestId: "req_test",
      },
    })
    expect(result.success).toBe(true)
  })
})
