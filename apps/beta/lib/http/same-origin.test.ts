import { describe, expect, it } from "vitest"

import { appOrigins, isCrossSiteWrite } from "./same-origin"

const ORIGINS = ["https://beta.afframe.com"]

const headers = (init: Record<string, string>): Headers => new Headers(init)

describe("appOrigins", () => {
  it("takes the origin of BETTER_AUTH_URL, path stripped", () => {
    expect(
      appOrigins({ BETTER_AUTH_URL: "https://beta.afframe.com/sign-in" }),
    ).toEqual(["https://beta.afframe.com"])
  })

  it("merges the trusted-origins list and de-duplicates", () => {
    expect(
      appOrigins({
        BETTER_AUTH_URL: "https://beta.afframe.com",
        BETTER_AUTH_TRUSTED_ORIGINS:
          "https://beta.afframe.com, http://localhost:3200",
      }),
    ).toEqual(["https://beta.afframe.com", "http://localhost:3200"])
  })

  it("ignores a malformed entry instead of failing", () => {
    expect(
      appOrigins({
        BETTER_AUTH_URL: "https://beta.afframe.com",
        BETTER_AUTH_TRUSTED_ORIGINS: "not a url",
      }),
    ).toEqual(["https://beta.afframe.com"])
  })
})

describe("isCrossSiteWrite", () => {
  it("allows a same-origin browser write", () => {
    expect(
      isCrossSiteWrite(
        headers({
          "sec-fetch-site": "same-origin",
          origin: "https://beta.afframe.com",
        }),
        ORIGINS,
      ),
    ).toBe(false)
  })

  it("allows a non-browser client that sends neither header", () => {
    expect(isCrossSiteWrite(headers({}), ORIGINS)).toBe(false)
  })

  it.each([
    ["cross-site", "cross-site"],
    ["same-site (a sibling subdomain)", "same-site"],
  ])("refuses Sec-Fetch-Site: %s", (_label, site) => {
    expect(isCrossSiteWrite(headers({ "sec-fetch-site": site }), ORIGINS)).toBe(
      true,
    )
  })

  it("refuses a foreign Origin even without Sec-Fetch-Site", () => {
    expect(
      isCrossSiteWrite(headers({ origin: "https://evil.example" }), ORIGINS),
    ).toBe(true)
  })

  it("refuses the main product's own origin — it is not this app", () => {
    expect(
      isCrossSiteWrite(headers({ origin: "https://app.afframe.com" }), ORIGINS),
    ).toBe(true)
  })

  it("falls back to the cookie rule when no origin is configured", () => {
    expect(
      isCrossSiteWrite(headers({ origin: "https://anything.example" }), []),
    ).toBe(false)
  })
})
