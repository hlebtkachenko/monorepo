import { describe, expect, it } from "vitest"
import { resolveOAuthAudiences } from "./oauth-audience"

describe("resolveOAuthAudiences", () => {
  it("advertises the mcp resource as a valid audience when OAUTH_RESOURCE is set", () => {
    expect(resolveOAuthAudiences("https://mcp.afframe.com")).toEqual([
      "https://mcp.afframe.com",
    ])
  })

  it("trims surrounding whitespace", () => {
    expect(resolveOAuthAudiences("  https://mcp.afframe.com  ")).toEqual([
      "https://mcp.afframe.com",
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
