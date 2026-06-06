import { describe, it, expect } from "vitest"
import {
  constantTimeEqual,
  isAuthorizedIngest,
  isValidWebhookSecret,
  isAllowedUser,
} from "./auth.js"

describe("constantTimeEqual", () => {
  it("true for equal strings", () =>
    expect(constantTimeEqual("abc", "abc")).toBe(true))
  it("false for different content", () =>
    expect(constantTimeEqual("abc", "abd")).toBe(false))
  it("false for length mismatch", () =>
    expect(constantTimeEqual("ab", "abc")).toBe(false))
})

describe("isAuthorizedIngest", () => {
  const secret = "ingest-secret"
  it("accepts the bearer token", () =>
    expect(isAuthorizedIngest(`Bearer ${secret}`, secret)).toBe(true))
  it("accepts a bare token", () =>
    expect(isAuthorizedIngest(secret, secret)).toBe(true))
  it("rejects a wrong token", () =>
    expect(isAuthorizedIngest("Bearer nope", secret)).toBe(false))
  it("rejects a missing header", () =>
    expect(isAuthorizedIngest(undefined, secret)).toBe(false))
})

describe("isValidWebhookSecret", () => {
  it("accepts the matching header", () =>
    expect(isValidWebhookSecret("tok", "tok")).toBe(true))
  it("rejects a mismatch", () =>
    expect(isValidWebhookSecret("tok", "other")).toBe(false))
  it("rejects undefined", () =>
    expect(isValidWebhookSecret(undefined, "tok")).toBe(false))
})

describe("isAllowedUser", () => {
  it("accepts the allowlisted id", () =>
    expect(isAllowedUser(423643350, 423643350)).toBe(true))
  it("rejects another id", () =>
    expect(isAllowedUser(1, 423643350)).toBe(false))
  it("rejects undefined from", () =>
    expect(isAllowedUser(undefined, 423643350)).toBe(false))
  it("rejects a NaN allowlist", () =>
    expect(isAllowedUser(1, Number.NaN)).toBe(false))
})
