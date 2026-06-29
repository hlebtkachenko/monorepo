import { describe, expect, it } from "vitest"

import {
  canAccessSection,
  isKillSwitchFlag,
  lookupSectionAccess,
  lookupStepUp,
  SECTION_ACCESS,
  STEP_UP,
} from "./capabilities"

describe("lookupSectionAccess (longest-prefix)", () => {
  it("matches an exact top-level path", () => {
    expect(lookupSectionAccess("/orgs")).toEqual(SECTION_ACCESS["/orgs"])
  })

  it("matches a deep path via parent prefix", () => {
    expect(lookupSectionAccess("/orgs/abc-123/members")).toEqual(
      SECTION_ACCESS["/orgs"],
    )
  })

  it("prefers the longest matching prefix", () => {
    // `/ops/sql` is owner-only; `/ops` is broader.
    expect(lookupSectionAccess("/ops/sql/run")).toEqual(
      SECTION_ACCESS["/ops/sql"],
    )
  })

  it("returns the universal list for the root", () => {
    expect(lookupSectionAccess("/")).toEqual(SECTION_ACCESS["/"])
  })

  it("returns undefined for unmapped paths (fail closed)", () => {
    expect(lookupSectionAccess("/totally/made-up/route")).toBeUndefined()
  })

  it("does NOT fall back to / for unmapped sub-paths", () => {
    // Regression guard for the original `|| p === "/"` bug.
    const result = lookupSectionAccess("/totally/made-up/route")
    expect(result).not.toEqual(SECTION_ACCESS["/"])
  })
})

describe("canAccessSection", () => {
  it("owner can reach everything, including unmapped routes", () => {
    expect(canAccessSection("owner", "/")).toBe(true)
    expect(canAccessSection("owner", "/ops/sql")).toBe(true)
    expect(canAccessSection("owner", "/some/unmapped/path")).toBe(true)
  })

  it("guest reaches Home + /profile + /changelog only", () => {
    expect(canAccessSection("guest", "/")).toBe(true)
    expect(canAccessSection("guest", "/profile")).toBe(true)
    expect(canAccessSection("guest", "/changelog")).toBe(true)
    expect(canAccessSection("guest", "/orgs")).toBe(false)
    expect(canAccessSection("guest", "/ops")).toBe(false)
  })

  it("non-owner fails closed on unmapped paths", () => {
    expect(canAccessSection("support", "/some/unmapped/path")).toBe(false)
    expect(canAccessSection("developer", "/totally/new/route")).toBe(false)
  })

  it("longest-prefix overrides parent grant for owner-only sub-section", () => {
    // admin has /ops access but NOT the owner-only /ops/sql
    expect(canAccessSection("admin", "/ops")).toBe(true)
    expect(canAccessSection("admin", "/ops/sql")).toBe(false)
    expect(canAccessSection("admin", "/ops/sql/run")).toBe(false)
  })

  it("admin can reach deep paths under granted sections", () => {
    expect(canAccessSection("admin", "/orgs/abc-123/members")).toBe(true)
    expect(canAccessSection("admin", "/users/u-1/sessions")).toBe(true)
  })

  it("security has impersonation + audit but not the SQL editor", () => {
    expect(canAccessSection("security", "/compliance/impersonation")).toBe(true)
    expect(canAccessSection("security", "/compliance/audit")).toBe(true)
    expect(canAccessSection("security", "/ops/sql")).toBe(false)
  })

  it("designer has the design system but not ops or platform", () => {
    expect(canAccessSection("designer", "/showcase")).toBe(true)
    expect(canAccessSection("designer", "/storybook")).toBe(true)
    expect(canAccessSection("designer", "/typography")).toBe(true)
    expect(canAccessSection("designer", "/ops")).toBe(false)
    expect(canAccessSection("designer", "/platform")).toBe(false)
  })
})

describe("isKillSwitchFlag", () => {
  it("matches the documented prefixes", () => {
    expect(isKillSwitchFlag("maintenance.lockdown")).toBe(true)
    expect(isKillSwitchFlag("kill_switch.api")).toBe(true)
    expect(isKillSwitchFlag("auth.disable_login")).toBe(true)
    expect(isKillSwitchFlag("emergency.brake")).toBe(true)
  })

  it("ignores everyday flags", () => {
    expect(isKillSwitchFlag("ui.new_palette")).toBe(false)
    expect(isKillSwitchFlag("growth.invite_caps")).toBe(false)
  })

  it("is case-sensitive (uppercased prefixes are NOT kill switches)", () => {
    expect(isKillSwitchFlag("MAINTENANCE.lockdown")).toBe(false)
  })
})

describe("lookupStepUp", () => {
  it("returns level for known paths", () => {
    expect(lookupStepUp("/ops/sql")).toBe("twofa")
    expect(lookupStepUp("/ops/maintenance")).toBe("password")
    expect(lookupStepUp("impersonation.start")).toBe("password")
    expect(lookupStepUp("flag.kill_switch")).toBe("twofa")
    expect(lookupStepUp("invites.signup_token")).toBe("password")
  })

  it("returns undefined for everyday paths", () => {
    expect(lookupStepUp("/orgs")).toBeUndefined()
    expect(lookupStepUp("/")).toBeUndefined()
  })

  it("nuclear pages require twofa", () => {
    for (const path of ["/ops/sql", "/ops/kill-switches", "/staff/roles"]) {
      expect(STEP_UP[path]).toBe("twofa")
    }
  })
})
