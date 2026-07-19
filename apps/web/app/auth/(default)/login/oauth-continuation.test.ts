import { describe, expect, it } from "vitest"

import { safeNext } from "@/lib/safe-next"

import { oauthContinuationNext } from "./oauth-continuation"

/**
 * A representative Better-Auth authorize redirect query: the real OAuth request
 * params plus BA's login-round-trip signing artifacts (exp, ba_iat, ba_pl, sig).
 */
function baAuthorizeRedirect(): URLSearchParams {
  return new URLSearchParams({
    client_id: "mcp-client-abc",
    redirect_uri: "https://claude.ai/api/mcp/auth_callback",
    response_type: "code",
    scope: "openid accounting:read",
    code_challenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM",
    code_challenge_method: "S256",
    state: "xyz-state",
    resource: "https://mcp.afframe.com",
    exp: "1893456000",
    ba_iat: "1893455400000",
    ba_pl: "session-42",
    sig: "OLD_SIGNATURE_THAT_MUST_NOT_SURVIVE",
  })
}

describe("oauthContinuationNext", () => {
  it("returns null for a plain login (no oauth params)", () => {
    expect(oauthContinuationNext(new URLSearchParams())).toBeNull()
  })

  it("returns null for a deep-link login (?next= only, no client_id)", () => {
    const search = new URLSearchParams({ next: "/o/acme/accounting/ledger" })
    expect(oauthContinuationNext(search)).toBeNull()
  })

  it("returns null when client_id is present but redirect_uri is missing", () => {
    const search = new URLSearchParams({ client_id: "mcp-client-abc" })
    expect(oauthContinuationNext(search)).toBeNull()
  })

  it("synthesizes the authorize continuation from a BA redirect", () => {
    const next = oauthContinuationNext(baAuthorizeRedirect())
    expect(next).not.toBeNull()
    expect(next!.startsWith("/api/auth/oauth2/authorize?")).toBe(true)

    const query = new URLSearchParams(next!.split("?")[1])
    expect(query.get("client_id")).toBe("mcp-client-abc")
    expect(query.get("redirect_uri")).toBe(
      "https://claude.ai/api/mcp/auth_callback",
    )
    expect(query.get("response_type")).toBe("code")
    expect(query.get("scope")).toBe("openid accounting:read")
    expect(query.get("code_challenge_method")).toBe("S256")
    expect(query.get("state")).toBe("xyz-state")
    // RFC 8707 resource must survive so the AS mints an audience-bound JWT.
    expect(query.get("resource")).toBe("https://mcp.afframe.com")
  })

  it("STRIPS the BA signing artifacts (double-sign guard)", () => {
    const next = oauthContinuationNext(baAuthorizeRedirect())
    const query = new URLSearchParams(next!.split("?")[1])
    for (const artifact of ["sig", "exp", "ba_iat", "ba_pl"]) {
      expect(query.has(artifact)).toBe(false)
    }
    expect(next).not.toContain("OLD_SIGNATURE")
  })

  it("produces a value that survives safeNext unchanged (same-origin)", () => {
    const next = oauthContinuationNext(baAuthorizeRedirect())!
    expect(safeNext(next, "/workspace")).toBe(next)
  })
})
