import { afterEach, describe, expect, it } from "vitest"

import { betaPortalOrigin, betaPortalUrl } from "./portal-url"

const ORIGINAL = process.env["BETTER_AUTH_URL"]

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env["BETTER_AUTH_URL"]
  else process.env["BETTER_AUTH_URL"] = ORIGINAL
})

describe("betaPortalOrigin", () => {
  it("takes the origin of BETTER_AUTH_URL, path stripped", () => {
    process.env["BETTER_AUTH_URL"] = "https://beta.afframe.com/sign-in"
    expect(betaPortalOrigin()).toBe("https://beta.afframe.com")
  })

  it("falls back to localhost when unset", () => {
    delete process.env["BETTER_AUTH_URL"]
    expect(betaPortalOrigin()).toBe("http://localhost:3200")
  })

  it("falls back to localhost on a malformed value rather than throwing", () => {
    process.env["BETTER_AUTH_URL"] = "not a url"
    expect(betaPortalOrigin()).toBe("http://localhost:3200")
  })
})

describe("betaPortalUrl", () => {
  it("joins the origin and a leading-slash path", () => {
    process.env["BETTER_AUTH_URL"] = "https://beta.afframe.com"
    expect(betaPortalUrl("/acme-sro/dokumenty")).toBe(
      "https://beta.afframe.com/acme-sro/dokumenty",
    )
  })

  it("adds the leading slash when the caller forgets it", () => {
    process.env["BETTER_AUTH_URL"] = "https://beta.afframe.com"
    expect(betaPortalUrl("acme-sro")).toBe("https://beta.afframe.com/acme-sro")
  })
})
