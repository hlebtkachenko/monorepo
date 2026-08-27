/**
 * Revoking a mis-bound employee seat — the remediation half of spec §2.6.1.
 *
 * The binding is created by consuming a pre-bound setup token, so these cases
 * create the seat the way the product does (`inviteEmployeeSeat` →
 * `consumeSetupToken`) rather than by writing `app_user_id` directly. A test
 * that planted the column would be testing an `UPDATE`, and the property worth
 * proving is that a seat produced by the real path can be taken away by the
 * real path.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createPayrollEmployeeRow,
  endFixtures,
  seedOrganization,
  type TestOrganization,
} from "../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

const { revokeEmployeeSeat } = await import("./employee-seats")
const { requireOffice, requireScope, isEmployeeSeat } = await import("../scope")
const { inviteEmployeeSeat } = await import("../employee-seat")
const { consumeSetupToken, issueSetupToken } =
  await import("@/lib/auth/setup-token")
const { payrollEmployeesForScope } = await import("../payroll")

let org: TestOrganization

beforeAll(async () => {
  org = await seedOrganization()
})

afterAll(async () => {
  await endFixtures()
})

function as(headers: Headers, ip = "203.0.113.9"): void {
  const next = new Headers(headers)
  next.set("cf-connecting-ip", ip)
  request.headers = next
}

/** An OfficeScope for the seeded owner, who is office staff. */
async function office() {
  as(org.members.owner.headers)
  return requireOffice()
}

let seatSequence = 0

/**
 * Seat an employee the way the product does, and hand back everything a
 * revocation case needs.
 */
async function seatFor(
  book: TestOrganization,
  fullName: string,
): Promise<{ employeeId: string; email: string; userId: string }> {
  const employeeId = await createPayrollEmployeeRow(book.organizationId, {
    fullName,
  })
  const email = `seat-${(seatSequence += 1)}@example.com`

  as(book.members.owner.headers, `198.51.100.${seatSequence % 250}`)
  const invited = await inviteEmployeeSeat(await requireScope(book.slug), {
    employeeId,
    email,
    ip: null,
    userAgent: null,
  })
  expect(invited.ok, "the invite was issued").toBe(true)
  if (!invited.ok) throw new Error("unreachable")

  const consumed = await consumeSetupToken({
    rawToken: invited.link.token,
    allowedPurposes: ["org_invite"],
    password: "correct horse battery staple 42",
    ip: null,
    userAgent: null,
  })
  expect(consumed.ok, "the link was consumed").toBe(true)
  if (!consumed.ok) throw new Error("unreachable")

  return { employeeId, email, userId: consumed.userId }
}

describe("revokeEmployeeSeat", () => {
  it("clears the link AND deactivates the guest membership", async () => {
    // Both halves, because either alone is worse than useless. Clearing the
    // link on its own leaves the wrong human a plain `guest` — spec §5's
    // EXTERNAL VIEWER of client-visible data — so they would stop reading one
    // person's payslips and start reading the company's book.
    const seat = await seatFor(org, "Zedník Omylem Pozvaný")

    const result = await revokeEmployeeSeat(await office(), {
      organizationId: org.organizationId,
      payrollEmployeeId: seat.employeeId,
    })

    expect(result).toEqual({
      ok: true,
      unboundUserId: seat.userId,
      membershipDeactivated: true,
      revokedInvites: 0,
    })

    // The register row survives — the person is still an employee of this
    // company; only their portal account stopped being them.
    as(org.members.owner.headers)
    const register = await payrollEmployeesForScope(
      await requireScope(org.slug),
    )
    expect(register.map((row) => row.id)).toContain(seat.employeeId)
    expect(
      register.find((row) => row.id === seat.employeeId)?.hasPortalAccount,
    ).toBe(false)
  })

  /**
   * ADVISOR GATE FIND. The revocation was incomplete without this: a seat is
   * mis-bound BECAUSE its invite went to the wrong address, so the live token
   * pre-bound to this employee row is routinely addressed to somebody the
   * deactivated membership has nothing to do with. Migration 0002's trigger
   * keys on the PERSON and cannot see it.
   *
   * Left alone, that token is a working key: `consumeSetupToken` claims on
   * `app_user_id IS NULL OR = me`, and the unbind had just made it NULL. The
   * office would have revoked a seat and handed the next wrong human the same
   * payslips.
   */
  it("kills an unconsumed invite pre-bound to the same employee row", async () => {
    // CONSTRUCTING THE STATE THE WAY THE SYSTEM REACHES IT.
    //
    // Two existing sweeps already narrow this: re-ISSUING a seat invite revokes
    // earlier live ones for that employee (`setup-token.ts`), and consuming one
    // revokes address-siblings. What neither covers is the residual the
    // issuance comment names out loud and accepts:
    //
    //     "two issuances for the same employee that overlap in time each revoke
    //      what their own snapshot could see and then insert, so both new rows
    //      can end up live … whichever link is claimed first binds; every other
    //      link naming that employee … is refused WITHOUT BEING BURNT."
    //
    // Refused without being burnt means unconsumed, unrevoked, still live. That
    // was safe on one premise — the row stays bound, so the loser can never
    // claim it — and `revokeEmployeeSeat` is the thing that breaks the premise
    // by setting `app_user_id` back to NULL.
    //
    // The race itself is nondeterministic, so the loser is minted directly
    // through `issueSetupToken` while the row is already bound. That is the
    // same row the race leaves behind, without a sleep and without a flake.
    const seat = await seatFor(org, "Zedník Se Zbylým Odkazem")

    as(org.members.owner.headers, "198.51.100.201")
    const stray = await issueSetupToken({
      purpose: "org_invite",
      email: `stray-${(seatSequence += 1)}@example.com`,
      organizationId: org.organizationId,
      grantedRole: "guest",
      payrollEmployeeId: seat.employeeId,
      issuer: {
        kind: "organization",
        userId: org.members.owner.userId,
        organizationId: org.organizationId,
        role: "owner",
      },
      ip: null,
      userAgent: null,
    })
    expect(stray, "the raced loser exists and is live").toMatchObject({
      ok: true,
    })
    if (!stray.ok) throw new Error("unreachable")

    const employeeId = seat.employeeId
    const result = await revokeEmployeeSeat(await office(), {
      organizationId: org.organizationId,
      payrollEmployeeId: employeeId,
    })
    expect(result).toMatchObject({ ok: true, revokedInvites: 1 })

    // The stray link is dead. Without the sweep this consume SUCCEEDS and
    // re-binds `app_user_id` to a brand-new account.
    const replay = await consumeSetupToken({
      rawToken: stray.link.token,
      allowedPurposes: ["org_invite"],
      password: "correct horse battery staple 42",
      ip: null,
      userAgent: null,
    })
    expect(replay.ok).toBe(false)

    // And the employee row really is still unbound afterwards.
    as(org.members.owner.headers)
    const register = await payrollEmployeesForScope(
      await requireScope(org.slug),
    )
    expect(
      register.find((row) => row.id === employeeId)?.hasPortalAccount,
    ).toBe(false)
  })

  it("leaves another employee's outstanding invite alone", async () => {
    // The sweep is keyed on ONE employee row. A colleague's pending seat invite
    // is not collateral.
    const doomed = await seatFor(org, "Zedník Odvolaný")

    const employeeId = await createPayrollEmployeeRow(org.organizationId, {
      fullName: "Kolega Čekající",
    })
    as(org.members.owner.headers, "198.51.100.202")
    const colleague = await inviteEmployeeSeat(await requireScope(org.slug), {
      employeeId,
      email: `colleague-${(seatSequence += 1)}@example.com`,
      ip: null,
      userAgent: null,
    })
    expect(colleague.ok).toBe(true)
    if (!colleague.ok) throw new Error("unreachable")

    await revokeEmployeeSeat(await office(), {
      organizationId: org.organizationId,
      payrollEmployeeId: doomed.employeeId,
    })

    // Still consumable.
    const consumed = await consumeSetupToken({
      rawToken: colleague.link.token,
      allowedPurposes: ["org_invite"],
      password: "correct horse battery staple 42",
      ip: null,
      userAgent: null,
    })
    expect(consumed.ok).toBe(true)
  })

  it("refuses an employee id from another book, id in hand", async () => {
    // /admin is above organizations, so this call names BOTH — and the pairing
    // has to be checked, or the office could revoke any seat by pointing this
    // organization at another's employee.
    const other = await seedOrganization()
    const seat = await seatFor(other, "Cizí Zedník")

    const result = await revokeEmployeeSeat(await office(), {
      organizationId: org.organizationId,
      payrollEmployeeId: seat.employeeId,
    })

    expect(result).toEqual({ ok: false, reason: "unknown_employee" })

    // And the other book's seat is untouched — still revocable, which it would
    // not be had the call above reached it.
    const stillSeated = await revokeEmployeeSeat(await office(), {
      organizationId: other.organizationId,
      payrollEmployeeId: seat.employeeId,
    })
    expect(stillSeated.ok).toBe(true)
  })

  it("says not_bound rather than unknown_employee for an unseated row", async () => {
    // Two different facts for whoever is remediating: "there is no such
    // employee" and "that employee has no portal account" are different
    // problems with different next steps.
    const employeeId = await createPayrollEmployeeRow(org.organizationId, {
      fullName: "Nikdy Nepozvaný",
    })

    expect(
      await revokeEmployeeSeat(await office(), {
        organizationId: org.organizationId,
        payrollEmployeeId: employeeId,
      }),
    ).toEqual({ ok: false, reason: "not_bound" })
  })

  it("is idempotent — revoking twice is not an error the second time", async () => {
    const seat = await seatFor(org, "Zedník Dvakrát")

    expect(
      (
        await revokeEmployeeSeat(await office(), {
          organizationId: org.organizationId,
          payrollEmployeeId: seat.employeeId,
        })
      ).ok,
    ).toBe(true)

    expect(
      await revokeEmployeeSeat(await office(), {
        organizationId: org.organizationId,
        payrollEmployeeId: seat.employeeId,
      }),
    ).toEqual({ ok: false, reason: "not_bound" })
  })

  it("answers unknown_employee for a malformed id, without a Postgres error", async () => {
    // A 500 from a uuid cast is both a bad response and an oracle telling the
    // caller which ids are well-formed.
    for (const hostile of ["", "not-a-uuid", "' OR 1=1 --"]) {
      expect(
        await revokeEmployeeSeat(await office(), {
          organizationId: org.organizationId,
          payrollEmployeeId: hostile,
        }),
      ).toEqual({ ok: false, reason: "unknown_employee" })
    }
  })

  it("does not deactivate a MEMBER who happens to be on the payroll", async () => {
    // An office manager who draws a salary is still management. The narrowing
    // to `role = 'guest'` is what keeps a payroll unbind from silently
    // withdrawing a manager's portal access.
    const book = await seedOrganization()
    const employeeId = await createPayrollEmployeeRow(book.organizationId, {
      fullName: "Vedoucí Na Mzdě",
      appUserId: book.members.member.userId,
    })

    const result = await revokeEmployeeSeat(await office(), {
      organizationId: book.organizationId,
      payrollEmployeeId: employeeId,
    })

    expect(result).toEqual({
      ok: true,
      revokedInvites: 0,
      unboundUserId: book.members.member.userId,
      membershipDeactivated: false,
    })

    // Still a member, still reading the book.
    as(book.members.member.headers)
    const scope = await requireScope(book.slug)
    expect(scope.role).toBe("member")
    expect(isEmployeeSeat(scope)).toBe(false)
  })
})
