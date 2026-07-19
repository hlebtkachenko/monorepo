import { describe, expect, it } from "vitest"
import type { JWTPayload } from "jose"
import {
  draftPrincipalFromClaims,
  parseScopeClaim,
} from "./oauth-token-verifier"
import { OAUTH_ORGANIZATION_CLAIM } from "./oauth-tenant-binding"

const ORG = "11111111-1111-7111-8111-111111111111"

function payload(extra: Record<string, unknown>): JWTPayload {
  return extra as JWTPayload
}

describe("parseScopeClaim", () => {
  it("splits a space-delimited string and drops blanks", () => {
    expect(parseScopeClaim("openid profile")).toEqual(["openid", "profile"])
    expect(parseScopeClaim("  read   write ")).toEqual(["read", "write"])
  })
  it("accepts a string[] and drops non-strings/empties", () => {
    expect(parseScopeClaim(["a", "", "b"])).toEqual(["a", "b"])
    expect(parseScopeClaim(["a", 1, null, "b"])).toEqual(["a", "b"])
  })
  it("returns [] for absent / non-scope values", () => {
    expect(parseScopeClaim(undefined)).toEqual([])
    expect(parseScopeClaim(42)).toEqual([])
    expect(parseScopeClaim({})).toEqual([])
  })
})

describe("draftPrincipalFromClaims (fail-closed mapping)", () => {
  it("rejects a token with no subject", () => {
    expect(
      draftPrincipalFromClaims(
        payload({ [OAUTH_ORGANIZATION_CLAIM]: ORG, scope: "read" }),
      ),
    ).toEqual({ ok: false, reason: "missing_subject" })
  })

  it("rejects a token with no organization claim", () => {
    expect(
      draftPrincipalFromClaims(payload({ sub: "user-1", scope: "read" })),
    ).toEqual({ ok: false, reason: "missing_organization" })
  })

  it("rejects a non-string organization claim", () => {
    expect(
      draftPrincipalFromClaims(
        payload({
          sub: "user-1",
          [OAUTH_ORGANIZATION_CLAIM]: 123,
          scope: "read",
        }),
      ),
    ).toEqual({ ok: false, reason: "missing_organization" })
  })

  it("rejects EMPTY scopes (never maps to the legacy full-access allowance)", () => {
    expect(
      draftPrincipalFromClaims(
        payload({ sub: "user-1", [OAUTH_ORGANIZATION_CLAIM]: ORG }),
      ),
    ).toEqual({ ok: false, reason: "empty_scopes" })
    expect(
      draftPrincipalFromClaims(
        payload({
          sub: "user-1",
          [OAUTH_ORGANIZATION_CLAIM]: ORG,
          scope: "   ",
        }),
      ),
    ).toEqual({ ok: false, reason: "empty_scopes" })
  })

  it("accepts a well-formed token (string scope)", () => {
    expect(
      draftPrincipalFromClaims(
        payload({
          sub: "user-1",
          [OAUTH_ORGANIZATION_CLAIM]: ORG,
          scope: "read write",
        }),
      ),
    ).toEqual({
      ok: true,
      userId: "user-1",
      organizationId: ORG,
      scopes: ["read", "write"],
    })
  })

  it("accepts a well-formed token (array scope)", () => {
    expect(
      draftPrincipalFromClaims(
        payload({
          sub: "user-1",
          [OAUTH_ORGANIZATION_CLAIM]: ORG,
          scope: ["read"],
        }),
      ),
    ).toEqual({
      ok: true,
      userId: "user-1",
      organizationId: ORG,
      scopes: ["read"],
    })
  })
})
