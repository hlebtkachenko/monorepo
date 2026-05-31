import { describe, expect, it } from "vitest"
import { deriveCookieDomain } from "../lib/app-stack.js"

/**
 * The function is the source of truth for the leading-dot cookie scope
 * stamped on every Fargate container's `BETTER_AUTH_COOKIE_DOMAIN`. A
 * regression here silently breaks cross-subdomain session sharing
 * between `app.`, `admin.`, and any future surface on `afframe.com`,
 * so behaviour stays under unit-test coverage.
 */
describe("deriveCookieDomain", () => {
  it("returns the leading-dot apex for a two-label production host", () => {
    expect(deriveCookieDomain("app.afframe.com")).toBe(".afframe.com")
  })

  it("returns the leading-dot apex for a hyphenated staging host", () => {
    expect(deriveCookieDomain("app-staging.afframe.com")).toBe(".afframe.com")
  })

  it("returns the leading-dot apex for the admin subdomain", () => {
    expect(deriveCookieDomain("admin.afframe.com")).toBe(".afframe.com")
  })

  it("returns the leading-dot apex when given an apex host directly", () => {
    expect(deriveCookieDomain("afframe.com")).toBe(".afframe.com")
  })

  it("returns an empty string for a single-label host (opts out of cross-subdomain)", () => {
    expect(deriveCookieDomain("localhost")).toBe("")
  })

  it("returns the leading-dot apex for a three-label .co.uk-style host", () => {
    // The implementation slices the last two labels; a real `.co.uk`
    // deploy would need `.example.co.uk` and an explicit override.
    // This case documents the current behaviour rather than a fix.
    expect(deriveCookieDomain("app.example.co.uk")).toBe(".co.uk")
  })
})
