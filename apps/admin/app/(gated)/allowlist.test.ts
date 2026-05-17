import { describe, expect, it } from "vitest"

import { isWorkspaceAllowed, parseAdminWorkspaceAllowlist } from "./allowlist"

describe("parseAdminWorkspaceAllowlist", () => {
  it("returns [] for an unset or empty value", () => {
    expect(parseAdminWorkspaceAllowlist(undefined)).toEqual([])
    expect(parseAdminWorkspaceAllowlist("")).toEqual([])
    expect(parseAdminWorkspaceAllowlist("  ,  , ")).toEqual([])
  })

  it("splits, trims, and drops blank entries", () => {
    expect(parseAdminWorkspaceAllowlist(" ws-1 , ws-2 ,, ws-3 ")).toEqual([
      "ws-1",
      "ws-2",
      "ws-3",
    ])
  })
})

describe("isWorkspaceAllowed", () => {
  it("allows a user who is a member of an allowlisted workspace", () => {
    expect(isWorkspaceAllowed(["ws-9", "ws-2"], "ws-1,ws-2")).toBe(true)
  })

  it("denies a user with no membership in any allowlisted workspace", () => {
    expect(isWorkspaceAllowed(["ws-9", "ws-8"], "ws-1,ws-2")).toBe(false)
  })

  it("denies everyone when the allowlist is empty (fail closed)", () => {
    expect(isWorkspaceAllowed(["ws-1", "ws-2"], "")).toBe(false)
    expect(isWorkspaceAllowed(["ws-1"], undefined)).toBe(false)
  })

  it("denies a user with no workspace memberships", () => {
    expect(isWorkspaceAllowed([], "ws-1,ws-2")).toBe(false)
  })
})
