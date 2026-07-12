import { describe, expect, it } from "vitest"

import {
  activeAdminModule,
  ADMIN_MODULES,
  filterAdminModules,
} from "./admin-nav"

describe("filterAdminModules", () => {
  it("guest sees only the universal-access pages (/, /profile, /changelog)", () => {
    const filtered = filterAdminModules(ADMIN_MODULES, "guest")
    const hrefs = filtered.flatMap((m) => m.pages.map((p) => p.href)).sort()
    expect(hrefs).toEqual(["/", "/changelog", "/profile"].sort())
  })

  it("owner sees every module + every page", () => {
    const filtered = filterAdminModules(ADMIN_MODULES, "owner")
    expect(filtered).toHaveLength(ADMIN_MODULES.length)
    const total = ADMIN_MODULES.reduce((n, m) => n + m.pages.length, 0)
    const got = filtered.reduce((n, m) => n + m.pages.length, 0)
    expect(got).toBe(total)
  })

  it("developer sees Platform + Ops but not Customers or Staff", () => {
    const labels = filterAdminModules(ADMIN_MODULES, "developer").map(
      (m) => m.label,
    )
    expect(labels).toContain("Platform")
    expect(labels).toContain("Ops")
    expect(labels).not.toContain("Customers")
    expect(labels).not.toContain("Staff")
  })

  it("designer sees Platform but not Customers, Ops, or Staff", () => {
    const labels = filterAdminModules(ADMIN_MODULES, "designer").map(
      (m) => m.label,
    )
    expect(labels).toContain("Platform")
    expect(labels).not.toContain("Customers")
    expect(labels).not.toContain("Ops")
    expect(labels).not.toContain("Staff")
  })

  it("support sees Customers but not Ops or Staff", () => {
    const labels = filterAdminModules(ADMIN_MODULES, "support").map(
      (m) => m.label,
    )
    expect(labels).toContain("Customers")
    expect(labels).not.toContain("Ops")
    expect(labels).not.toContain("Staff")
  })

  it("security sees Customers + Ops + Platform + Staff", () => {
    const labels = filterAdminModules(ADMIN_MODULES, "security").map(
      (m) => m.label,
    )
    expect(labels).toEqual(
      expect.arrayContaining(["Customers", "Ops", "Platform", "Staff"]),
    )
  })

  it("drops empty modules instead of an empty rail entry", () => {
    for (const m of filterAdminModules(ADMIN_MODULES, "guest")) {
      expect(m.pages.length).toBeGreaterThan(0)
    }
  })

  it("developer cannot see the SQL editor page (owner-only)", () => {
    const hrefs = filterAdminModules(ADMIN_MODULES, "developer").flatMap((m) =>
      m.pages.map((p) => p.href),
    )
    expect(hrefs).not.toContain("/ops/sql")
  })

  it("owner sees the SQL editor page", () => {
    const hrefs = filterAdminModules(ADMIN_MODULES, "owner").flatMap((m) =>
      m.pages.map((p) => p.href),
    )
    expect(hrefs).toContain("/ops/sql")
  })

  it("places Archetypes in Platform navigation", () => {
    const platform = ADMIN_MODULES.find((module) => module.id === "platform")
    expect(platform?.pages).toContainEqual(
      expect.objectContaining({
        href: "/platform/archetypes",
        label: "Archetypes",
      }),
    )
  })

  it("Now is the first module for every role that sees it", () => {
    for (const role of [
      "owner",
      "admin",
      "developer",
      "designer",
      "support",
      "security",
      "guest",
    ] as const) {
      const filtered = filterAdminModules(ADMIN_MODULES, role)
      expect(filtered[0]?.label).toBe("Now")
    }
  })
})

describe("activeAdminModule", () => {
  it("resolves a page to its owning module across non-prefix groups", () => {
    // /ops/* lives in Ops; /compliance/* and /orgs live in Customers.
    expect(activeAdminModule(ADMIN_MODULES, "/ops/health")?.id).toBe("ops")
    expect(activeAdminModule(ADMIN_MODULES, "/ops/debug")?.id).toBe("ops")
    expect(activeAdminModule(ADMIN_MODULES, "/compliance/audit")?.id).toBe(
      "customers",
    )
    expect(activeAdminModule(ADMIN_MODULES, "/orgs")?.id).toBe("customers")
  })

  it("falls back to the first module for an unmapped path", () => {
    expect(activeAdminModule(ADMIN_MODULES, "/totally-unknown")?.id).toBe("now")
  })
})
