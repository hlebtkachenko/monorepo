/**
 * The per-user email toggle and the recipient matrix, against a real
 * Postgres — `notifiableOrgMembers` is the query every §2.11 event reads
 * before sending anything, so its filters (role, active membership, disabled
 * account, the toggle itself) are asserted here against real rows rather than
 * against a mock.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  disableAccount,
  endFixtures,
  seedOrganization,
  setMembershipActive,
  type TestOrganization,
} from "../../tests/fixtures"

const {
  emailNotificationsEnabled,
  notifiableOrgMembers,
  setEmailNotificationsEnabled,
} = await import("./notification-prefs")

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

describe("emailNotificationsEnabled / setEmailNotificationsEnabled", () => {
  it("defaults to true for a fresh account", async () => {
    expect(await emailNotificationsEnabled(org.members.member.userId)).toBe(
      true,
    )
  })

  it("persists a write and reads it back", async () => {
    await setEmailNotificationsEnabled(org.members.member.userId, false)
    expect(await emailNotificationsEnabled(org.members.member.userId)).toBe(
      false,
    )

    await setEmailNotificationsEnabled(org.members.member.userId, true)
    expect(await emailNotificationsEnabled(org.members.member.userId)).toBe(
      true,
    )
  })

  it("reads true for an id that resolves to no row, rather than throwing", async () => {
    expect(
      await emailNotificationsEnabled("00000000-0000-0000-0000-000000000000"),
    ).toBe(true)
  })
})

describe("notifiableOrgMembers", () => {
  it("returns admin, member and guest — never owner — sorted by email", async () => {
    const recipients = await notifiableOrgMembers(org.organizationId)
    const userIds = recipients.map((r) => r.userId).sort()
    expect(userIds).toEqual(
      [
        org.members.admin.userId,
        org.members.member.userId,
        org.members.guest.userId,
      ].sort(),
    )
    expect(userIds).not.toContain(org.members.owner.userId)

    const emails = recipients.map((r) => r.email)
    expect(emails).toEqual([...emails].sort())
  })

  it("excludes an inactive membership", async () => {
    await setMembershipActive(
      org.organizationId,
      org.members.admin.userId,
      false,
    )
    try {
      const recipients = await notifiableOrgMembers(org.organizationId)
      expect(recipients.map((r) => r.userId)).not.toContain(
        org.members.admin.userId,
      )
    } finally {
      await setMembershipActive(
        org.organizationId,
        org.members.admin.userId,
        true,
      )
    }
  })

  it("excludes a disabled account", async () => {
    await disableAccount(org.members.member.userId)
    try {
      const recipients = await notifiableOrgMembers(org.organizationId)
      expect(recipients.map((r) => r.userId)).not.toContain(
        org.members.member.userId,
      )
    } finally {
      // Undo via a fresh account is not possible (disableAccount has no
      // inverse in the fixtures) — reseed the world for the tests after this
      // one instead of leaving a disabled account behind.
      org = await seedOrganization()
    }
  })

  it("excludes a recipient who turned the toggle off", async () => {
    const fresh = await seedOrganization()
    await setEmailNotificationsEnabled(fresh.members.guest.userId, false)

    const recipients = await notifiableOrgMembers(fresh.organizationId)
    expect(recipients.map((r) => r.userId)).not.toContain(
      fresh.members.guest.userId,
    )
    expect(recipients.map((r) => r.userId)).toEqual(
      expect.arrayContaining([
        fresh.members.admin.userId,
        fresh.members.member.userId,
      ]),
    )
  })
})
