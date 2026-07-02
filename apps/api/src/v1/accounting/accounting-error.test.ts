import { describe, expect, it } from "vitest"

import {
  ConflictError,
  DomainError,
  NotFoundError,
  ValidationError,
} from "@workspace/shared/errors"

import { translateAccountingError } from "./accounting-error"

/** Run the translator and return whatever it throws. */
function caught(e: unknown): unknown {
  try {
    translateAccountingError(e)
  } catch (thrown) {
    return thrown
  }
  throw new Error("translateAccountingError did not throw")
}

describe("translateAccountingError", () => {
  it("maps the domain one()-guard miss (RLS-hidden row) to 404 — no existence leak", () => {
    const err = caught(new Error("expected exactly one row, got none"))
    expect(err).toBeInstanceOf(NotFoundError)
  })

  it("maps a 23503 FK violation to 404", () => {
    const err = caught({ code: "23503", message: "insert violates FK" })
    expect(err).toBeInstanceOf(NotFoundError)
  })

  it("maps the idempotency unique violation (23505) to a 409 conflict", () => {
    const err = caught({
      code: "23505",
      constraint_name: "tool_call_log_idemp_unique",
      message: "duplicate key",
    })
    expect(err).toBeInstanceOf(ConflictError)
  })

  it("maps a closed period (P0001) to 409", () => {
    const err = caught(new Error("period 2024 is CLOSED"))
    expect(err).toBeInstanceOf(ConflictError)
  })

  it("maps a period not visible for the tenant to 404 (no cross-tenant leak)", () => {
    const err = caught(new Error("period is not visible for this tenant"))
    expect(err).toBeInstanceOf(NotFoundError)
  })

  it("maps a posting date outside its period to 422", () => {
    const err = caught(new Error("posting date is outside its period"))
    expect(err).toBeInstanceOf(ValidationError)
  })

  it("maps an unbalanced posting to 422", () => {
    const err = caught(new Error("the posting is unbalanced (MD != Dal)"))
    expect(err).toBeInstanceOf(ValidationError)
  })

  it("maps an append-only violation to 409", () => {
    const err = caught(new Error("append-only table cannot be updated"))
    expect(err).toBeInstanceOf(ConflictError)
  })

  it("maps a domain validation Error (accounting: prefix) to 422 and strips the prefix", () => {
    const err = caught(new Error("accounting: vat_rate is required"))
    expect(err).toBeInstanceOf(ValidationError)
    expect((err as Error).message).toBe("vat_rate is required")
  })

  it("passes an already-mapped DomainError through unchanged", () => {
    const original = new ConflictError("already in progress")
    const err = caught(original)
    expect(err).toBe(original)
    expect(err).toBeInstanceOf(DomainError)
  })

  it("rethrows an unrecognized error as-is (→ 500)", () => {
    const original = new Error("kernel panic")
    const err = caught(original)
    expect(err).toBe(original)
    expect(err).not.toBeInstanceOf(DomainError)
  })
})
