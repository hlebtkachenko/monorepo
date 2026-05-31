/**
 * resolveAuthTokenEnv() — fail-closed env resolution.
 *
 * Pure-function tests (no DB, no testcontainer). Each case mutates
 * process.env, calls the resolver, restores prior state. Tests run
 * serially to avoid cross-contamination of the global env.
 */

import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { resolveAuthTokenEnv } from "./auth-token"

let priorAuthTokenEnv: string | undefined
let priorNodeEnv: string | undefined

beforeEach(() => {
  priorAuthTokenEnv = process.env["AUTH_TOKEN_ENV"]
  priorNodeEnv = process.env["NODE_ENV"]
  delete process.env["AUTH_TOKEN_ENV"]
  delete process.env["NODE_ENV"]
})

afterEach(() => {
  if (priorAuthTokenEnv === undefined) {
    delete process.env["AUTH_TOKEN_ENV"]
  } else {
    process.env["AUTH_TOKEN_ENV"] = priorAuthTokenEnv
  }
  if (priorNodeEnv === undefined) {
    delete process.env["NODE_ENV"]
  } else {
    process.env["NODE_ENV"] = priorNodeEnv
  }
})

describe("resolveAuthTokenEnv — valid explicit value", () => {
  it.each(["dev", "stg", "prd"] as const)(
    "returns %s when AUTH_TOKEN_ENV is set explicitly",
    (env) => {
      process.env["AUTH_TOKEN_ENV"] = env
      process.env["NODE_ENV"] = "production"
      expect(resolveAuthTokenEnv()).toBe(env)
    },
  )

  it("trims whitespace before validation", () => {
    process.env["AUTH_TOKEN_ENV"] = "  stg  "
    expect(resolveAuthTokenEnv()).toBe("stg")
  })
})

describe("resolveAuthTokenEnv — invalid explicit value (typo, garbage)", () => {
  it.each(["dvelopment", "staging", "production", "PRD", "DEV", "qa", "test"])(
    "throws when AUTH_TOKEN_ENV is set to invalid value %s",
    (bad) => {
      process.env["AUTH_TOKEN_ENV"] = bad
      // The throw on invalid is the security-critical branch: a typo
      // like AUTH_TOKEN_ENV=staging (instead of stg) used to fall
      // through the explicit-match and hit the NODE_ENV branch,
      // silently producing the wrong code. Fail-closed now.
      expect(() => resolveAuthTokenEnv()).toThrow(/must be one of/)
    },
  )

  it("throws on empty-string AUTH_TOKEN_ENV when NODE_ENV=production", () => {
    process.env["AUTH_TOKEN_ENV"] = ""
    process.env["NODE_ENV"] = "production"
    // Empty string is treated as unset; the production guard then fires.
    expect(() => resolveAuthTokenEnv()).toThrow(
      /required when NODE_ENV=production/,
    )
  })
})

describe("resolveAuthTokenEnv — fail-closed in production without AUTH_TOKEN_ENV", () => {
  it("throws when NODE_ENV=production and AUTH_TOKEN_ENV is unset", () => {
    process.env["NODE_ENV"] = "production"
    expect(() => resolveAuthTokenEnv()).toThrow(
      /required when NODE_ENV=production/,
    )
  })

  it("does NOT silently default to prd (regression guard for AFF-215)", () => {
    process.env["NODE_ENV"] = "production"
    // The pre-AFF-215 code returned "prd" here. Every Fargate container
    // (web/admin/api) sets NODE_ENV=production for Next.js, including
    // staging — so the silent default would stamp staging tokens with
    // the prd checksum envelope and defeat the cross-env replay gate.
    let returned: string | undefined
    try {
      returned = resolveAuthTokenEnv()
    } catch {
      // expected
    }
    expect(returned).toBeUndefined()
  })
})

describe("resolveAuthTokenEnv — dev fallback for non-production", () => {
  it("returns dev when AUTH_TOKEN_ENV is unset and NODE_ENV is not production", () => {
    expect(resolveAuthTokenEnv()).toBe("dev")
  })

  it.each(["development", "test", undefined])(
    "returns dev when NODE_ENV=%s and AUTH_TOKEN_ENV is unset",
    (nodeEnv) => {
      if (nodeEnv !== undefined) {
        process.env["NODE_ENV"] = nodeEnv
      }
      expect(resolveAuthTokenEnv()).toBe("dev")
    },
  )
})
