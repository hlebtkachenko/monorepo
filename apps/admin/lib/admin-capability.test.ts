import { describe, expect, it } from "vitest"

import { ADMIN_CAPABILITIES } from "./admin-capability"

describe("ADMIN_CAPABILITIES", () => {
  it("uses the admin:<section>.<verb> shape", () => {
    for (const cap of Object.keys(ADMIN_CAPABILITIES)) {
      expect(cap).toMatch(/^admin:[a-z_]+(\.[a-z_.]+)?$/)
    }
  })

  it("includes the load-bearing write capabilities", () => {
    const keys = Object.keys(ADMIN_CAPABILITIES)
    expect(keys).toContain("admin:impersonate")
    expect(keys).toContain("admin:flag.write")
    expect(keys).toContain("admin:session.revoke")
    expect(keys).toContain("admin:api_key.revoke")
    expect(keys).toContain("admin:outbox.retry")
    expect(keys).toContain("admin:read")
  })

  it("nuclear capabilities are owner-only", () => {
    for (const cap of [
      "admin:role.write",
      "admin:sql.write",
      "admin:kill_switch",
    ]) {
      const roles = ADMIN_CAPABILITIES[cap]
      expect(roles, `${cap} missing from map`).toBeDefined()
      expect(roles).toEqual(["owner"])
    }
  })

  it("every capability lists owner", () => {
    for (const [cap, roles] of Object.entries(ADMIN_CAPABILITIES)) {
      expect(roles, `${cap} missing owner`).toContain("owner")
    }
  })

  it("guest never appears on a write capability", () => {
    for (const [cap, roles] of Object.entries(ADMIN_CAPABILITIES)) {
      if (cap === "admin:read") continue
      expect(roles, `${cap} grants guest`).not.toContain("guest")
    }
  })
})
