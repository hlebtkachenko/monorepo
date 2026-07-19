import { describe, expect, it } from "vitest"
import { oauthAudienceVariants, resolveOAuthAudiences } from "./oauth-audience"

describe("oauthAudienceVariants", () => {
  it("returns both slash spellings for a no-slash resource", () => {
    expect(oauthAudienceVariants("https://mcp.afframe.com")).toEqual([
      "https://mcp.afframe.com",
      "https://mcp.afframe.com/",
    ])
  })

  it("normalizes a trailing slash to the same pair (order-stable)", () => {
    expect(oauthAudienceVariants("https://mcp.afframe.com/")).toEqual([
      "https://mcp.afframe.com",
      "https://mcp.afframe.com/",
    ])
  })

  it("collapses repeated trailing slashes", () => {
    expect(oauthAudienceVariants("https://mcp.afframe.com///")).toEqual([
      "https://mcp.afframe.com",
      "https://mcp.afframe.com/",
    ])
  })
})

describe("resolveOAuthAudiences", () => {
  it("advertises both slash spellings so a client's trailing-slash resource is accepted", () => {
    // Claude Code registers `https://mcp.afframe.com/` and sends
    // `resource=https://mcp.afframe.com/`; the AS must accept it (and the
    // no-slash canonical) or `checkResource` throws `requested resource invalid`.
    expect(resolveOAuthAudiences("https://mcp.afframe.com")).toEqual([
      "https://mcp.afframe.com",
      "https://mcp.afframe.com/",
    ])
  })

  it("trims surrounding whitespace", () => {
    expect(resolveOAuthAudiences("  https://mcp.afframe.com  ")).toEqual([
      "https://mcp.afframe.com",
      "https://mcp.afframe.com/",
    ])
  })

  it("returns undefined (keeps the library [baseURL] default) when unset or blank", () => {
    // Dev / test: no OAUTH_RESOURCE, so the AS behaves exactly as before —
    // never accidentally narrowing audiences to an empty set.
    expect(resolveOAuthAudiences(undefined)).toBeUndefined()
    expect(resolveOAuthAudiences("")).toBeUndefined()
    expect(resolveOAuthAudiences("   ")).toBeUndefined()
  })
})
