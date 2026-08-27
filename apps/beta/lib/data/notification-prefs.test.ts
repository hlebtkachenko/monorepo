/**
 * The per-user email toggle and the recipient matrix, against a real
 * Postgres — `notifiableOrgMembers` is the query every §2.11 event reads
 * before sending anything, so its filters (role, active membership, disabled
 * account, the toggle itself) are asserted here against real rows rather than
 * against a mock.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest"

import {
  addMembership,
  createPayrollEmployeeRow,
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

  /**
   * THE SEAT LEAK THIS FUNCTION'S OWN COMMENT PREDICTED AND THEN DID NOT CLOSE.
   *
   * The version before PR 38 said the seat link "does not exist yet … the day
   * PR 32 adds the link, this is the one place that exclusion joins in". The
   * link landed in PR 33 and the exclusion did not, so every employee seat was
   * on the recipient list for all three §2.11 events purely by being a `guest`.
   *
   * An email is a surface no route gate covers: "období bylo publikováno" lands
   * in a bricklayer's inbox whether or not they ever open the portal, and it is
   * exactly the company fact §2.6.1 does not admit them to.
   */
  it("excludes an employee seat — a guest linked to a payroll_employee row", async () => {
    const fresh = await seedOrganization()
    await createPayrollEmployeeRow(fresh.organizationId, {
      fullName: "Zedník Na Sedadle",
      appUserId: fresh.members.guest.userId,
    })

    const recipients = await notifiableOrgMembers(fresh.organizationId)
    expect(recipients.map((r) => r.userId)).not.toContain(
      fresh.members.guest.userId,
    )
    // And nobody else lost their mail on the way.
    expect(recipients.map((r) => r.userId).sort()).toEqual(
      [fresh.members.admin.userId, fresh.members.member.userId].sort(),
    )
  })

  it("keeps a MEMBER who is also on the payroll — the filter is the seat, not the link", async () => {
    // An office manager who draws a salary is still management. Dropping every
    // account with a `payroll_employee` row would silently unsubscribe them,
    // which is why the condition is `role = 'guest' AND linked` rather than
    // `linked` — the SQL spelling of `isEmployeeSeat`.
    const fresh = await seedOrganization()
    await createPayrollEmployeeRow(fresh.organizationId, {
      fullName: "Vedoucí Na Mzdě",
      appUserId: fresh.members.member.userId,
    })

    const recipients = await notifiableOrgMembers(fresh.organizationId)
    expect(recipients.map((r) => r.userId)).toContain(
      fresh.members.member.userId,
    )
  })

  it("keeps a plain guest, and does not confuse the two books a person sits in", async () => {
    // A person can be an employee at one client and an external viewer at
    // another. The join carries `organization_id`, so the seat exclusion must
    // not follow them across the boundary.
    const [employer, elsewhere] = await Promise.all([
      seedOrganization(),
      seedOrganization(),
    ])
    await addMembership(
      elsewhere.organizationId,
      employer.members.guest.userId,
      "guest",
    )
    await createPayrollEmployeeRow(employer.organizationId, {
      fullName: "Zedník Ve Dvou Knihách",
      appUserId: employer.members.guest.userId,
    })

    expect(
      (await notifiableOrgMembers(employer.organizationId)).map(
        (r) => r.userId,
      ),
    ).not.toContain(employer.members.guest.userId)
    expect(
      (await notifiableOrgMembers(elsewhere.organizationId)).map(
        (r) => r.userId,
      ),
    ).toContain(employer.members.guest.userId)
  })
})
