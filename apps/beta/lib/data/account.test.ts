/**
 * The forced-TOTP gate against real rows: who is redirected to `/zabezpeceni`
 * and who is not.
 *
 * `totp-enforcement.test.ts` exhausts the PREDICATE. This file is the other
 * half — that the three booleans fed to it are read correctly from the database:
 * from `app_user.is_staff`, from `app_user.two_factor_enabled`, and from an
 * ACTIVE owner membership in a LIVE organization.
 */
import postgres from "postgres"
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest"

import {
  addMembership,
  archiveOrganization,
  createAccount,
  createOrganization,
  endFixtures,
  seedOrganization,
  setMembershipActive,
  setStaff,
  type TestAccount,
  type TestOrganization,
} from "../../tests/fixtures"
import { sharedDatabaseUrl } from "../../tests/scratch-db"

const request = vi.hoisted(() => ({ headers: new Headers() }))
const navigation = vi.hoisted(() => ({ redirectedTo: [] as string[] }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/navigation", () => ({
  redirect: (path: string) => {
    navigation.redirectedTo.push(path)
    // Next's own `redirect` throws to unwind the render. Mirroring that keeps
    // "the gate redirects" indistinguishable from "the gate stops execution".
    const error = new Error(`NEXT_REDIRECT ${path}`)
    ;(error as { digest?: string }).digest = `NEXT_REDIRECT;${path}`
    throw error
  },
  notFound: () => {
    const error = new Error("NEXT_NOT_FOUND")
    ;(error as { digest?: string }).digest = "NEXT_HTTP_ERROR_FALLBACK;404"
    throw error
  },
}))

const { requireTotpEnrolment, viewerAccount } = await import("./account")

const sql = postgres(sharedDatabaseUrl(), { max: 2, onnotice: () => {} })

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

function as(account: TestAccount): void {
  request.headers = account.headers
}

/**
 * Undo the fixture's default (PR 22: a staff account is seeded ENROLLED, because
 * the tenancy seam now refuses an office account that is not, and every other
 * suite wants an accountant rather than a locked-out one). This suite's subject
 * is precisely the locked-out state, so it asks for it explicitly.
 */
async function markUnenrolled(userId: string): Promise<void> {
  await sql`
    UPDATE app_user SET two_factor_enabled = false WHERE id = ${userId}
  `
}

/** Better Auth's plugin owns this column; the fixture writes it directly. */
async function markEnrolled(userId: string): Promise<void> {
  await sql`
    UPDATE app_user SET two_factor_enabled = true WHERE id = ${userId}
  `
  await sql`
    INSERT INTO two_factor (user_id, secret, backup_codes, verified)
    VALUES (${userId}, 'encrypted', 'encrypted', true)
  `
}

/** Did the gate let this caller through? */
async function passesGate(): Promise<boolean> {
  navigation.redirectedTo = []
  try {
    await requireTotpEnrolment()
    return true
  } catch (error) {
    if ((error as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) {
      return false
    }
    throw error
  }
}

let org: TestOrganization

/**
 * THE MANDATE IS SWITCHED OFF BY DEFAULT (`BETA_TOTP_REQUIRED`, unset in every
 * environment today), so every case below that asserts a redirect has to switch
 * it on first. The suite says so once, here, rather than per test — and the
 * `describe("with the mandate switched off")` block at the bottom is the other
 * half: it asserts the same fixtures pass straight through with the switch back
 * where the deployment leaves it.
 */
beforeEach(async () => {
  vi.stubEnv("BETA_TOTP_REQUIRED", "true")
  org = await seedOrganization()
  await markUnenrolled(org.members.owner.userId)
  navigation.redirectedTo = []
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe("requireTotpEnrolment — the routing matrix", () => {
  it("blocks an unenrolled owner and names the enrolment screen", async () => {
    as(org.members.owner)
    expect(await passesGate()).toBe(false)
    expect(navigation.redirectedTo).toEqual(["/zabezpeceni"])
  })

  it("lets the same owner through once enrolled", async () => {
    await markEnrolled(org.members.owner.userId)
    as(org.members.owner)
    expect(await passesGate()).toBe(true)
    expect(navigation.redirectedTo).toEqual([])
  })

  it("leaves admin, member and guest alone", async () => {
    for (const role of ["admin", "member", "guest"] as const) {
      as(org.members[role])
      expect(await passesGate(), role).toBe(true)
    }
  })

  it("blocks office staff who hold no owner membership at all", async () => {
    // The gap that keying on the membership alone would leave: `is_staff` opens
    // /admin, which can mint memberships into every client book.
    const staff = await createAccount({ staff: true, twoFactorEnabled: false })
    as(staff)
    expect(await passesGate()).toBe(false)
  })

  it("stops blocking once the owner membership is deactivated and staff revoked", async () => {
    // A former accountant, offboarded: the seat is inactive and the staff flag
    // is gone, so there is nothing left to mandate.
    const owner = org.members.owner
    // The last-owner trigger refuses to strip an org's only owner, so seat a
    // second one first.
    const replacement = await createAccount({ staff: true })
    await addMembership(org.organizationId, replacement.userId, "owner")
    await setMembershipActive(org.organizationId, owner.userId, false)
    await setStaff(owner.userId, false)

    as(owner)
    expect(await passesGate()).toBe(true)
  })

  it("still blocks an owner whose only book has been archived", async () => {
    // The archived-organization filter in `readTotpSubject` mirrors
    // `requireScope` and is defence-in-depth, NOT an escape hatch: an owner is
    // office staff by DB invariant (see the next case), so `is_staff` keeps the
    // mandate on even after the last book they own is withdrawn. Asserted so a
    // future reader does not mistake that filter for "archiving a book
    // un-mandates its accountant".
    const archivable = await createOrganization()
    const accountant = await createAccount({
      staff: true,
      twoFactorEnabled: false,
    })
    await addMembership(archivable.organizationId, accountant.userId, "owner")

    as(accountant)
    expect(await passesGate()).toBe(false)

    await archiveOrganization(archivable.organizationId)
    as(accountant)
    expect(await passesGate()).toBe(false)
  })

  it("cannot be reduced to the membership alone — owner-without-staff is unreachable", async () => {
    // This is WHY the predicate ORs `isStaff` in rather than keying on the
    // membership: the database refuses to separate the two while the seat is
    // live (`app_user_owner_guard`, 0000_init.sql). An `is_staff` account with
    // no owner membership is reachable and IS the gap that keying on the
    // membership alone would leave open; the reverse is not reachable at all.
    await expect(setStaff(org.members.owner.userId, false)).rejects.toThrow(
      /cannot clear is_staff/,
    )
  })
})

describe("viewerAccount — Nastavení › Účet", () => {
  it("reports the mandate and the enrolment state for an owner", async () => {
    as(org.members.owner)
    const { account, totpEnrolmentRequired } = await viewerAccount()

    expect(account.email).toBe(org.members.owner.email)
    expect(account.totpEnabled).toBe(false)
    expect(account.totpMandatory).toBe(true)
    expect(totpEnrolmentRequired).toBe(true)
    // Staff-ness produced the mandate and does not travel itself.
    expect(account).not.toHaveProperty("isStaff")
  })

  it("reports no mandate for a client-side role", async () => {
    as(org.members.member)
    const { account, totpEnrolmentRequired } = await viewerAccount()

    expect(account.totpMandatory).toBe(false)
    expect(account.totpEnabled).toBe(false)
    // A member may still enrol voluntarily; they are simply not required to.
    expect(totpEnrolmentRequired).toBe(false)
  })

  it("reports an enrolled owner as enrolled AND still mandated", async () => {
    await markEnrolled(org.members.owner.userId)
    as(org.members.owner)
    const { account, totpEnrolmentRequired } = await viewerAccount()

    expect(account.totpEnabled).toBe(true)
    expect(account.totpMandatory).toBe(true)
    expect(totpEnrolmentRequired).toBe(false)
  })
})

/**
 * The deployed state (2026-08-27): `BETA_TOTP_REQUIRED` unset, so nobody is
 * forced to enrol. Same fixtures, same accounts, opposite verdict — which is the
 * only way to be sure the switch reaches the DB-fed path and not just the pure
 * predicate.
 */
describe("with the mandate switched off", () => {
  beforeEach(() => {
    vi.stubEnv("BETA_TOTP_REQUIRED", "")
  })

  it("lets an unenrolled owner straight through, with no redirect", async () => {
    as(org.members.owner)
    expect(await passesGate()).toBe(true)
    expect(navigation.redirectedTo).toEqual([])
  })

  it("lets an unenrolled staff account through too", async () => {
    const staff = await createAccount({ staff: true, twoFactorEnabled: false })
    as(staff)
    expect(await passesGate()).toBe(true)
    expect(navigation.redirectedTo).toEqual([])
  })

  it("stops claiming the obligation in Nastavení › Účet", async () => {
    as(org.members.owner)
    const { account, totpEnrolmentRequired } = await viewerAccount()

    expect(account.totpMandatory).toBe(false)
    expect(totpEnrolmentRequired).toBe(false)
    // The FEATURE is untouched: the flag still reports the account's real
    // state, so the enrolment UI keeps working for anyone who wants it.
    expect(account.totpEnabled).toBe(false)
  })

  it("still reports an enrolled owner as enrolled", async () => {
    await markEnrolled(org.members.owner.userId)
    as(org.members.owner)
    const { account } = await viewerAccount()

    expect(account.totpEnabled).toBe(true)
    expect(account.totpMandatory).toBe(false)
  })

  it("is off for every spelling but the exact string `true`", async () => {
    // A fuzzy check is how a gate ends up open on "false" — asserted against
    // the real gate rather than only the pure predicate.
    for (const value of ["1", "yes", "TRUE", "false"]) {
      vi.stubEnv("BETA_TOTP_REQUIRED", value)
      as(org.members.owner)
      expect(await passesGate(), value).toBe(true)
    }
  })
})
