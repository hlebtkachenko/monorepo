/**
 * Erasure, end to end — the /admin anonymize action against a real database.
 *
 * WHAT THIS SUITE IS ACTUALLY FOR. `anonymizeAppUser` is the only answer this
 * deployment has to a GDPR Art. 17 request, and it is irreversible. Two failure
 * modes matter and neither is visible from the return value:
 *
 *   IT DID NOT ERASE ENOUGH — a credential row, a live session, an unconsumed
 *   setup link, or the address itself survives, and the "erased" account can
 *   still be signed in as or claimed. Every one of those is asserted against the
 *   database directly rather than against the function's own counts.
 *
 *   IT ERASED TOO MUCH — the `activity_log` rows that name this person, or the
 *   memberships that place them in a book, are gone. That is the half Czech
 *   accounting retention obliges the office to keep, and it is what migration
 *   0021's `ON DELETE RESTRICT` exists to make impossible.
 *
 * Driven through the Server Action, for the reason spelled out at the top of
 * `office.test.ts`: an action is a public POST endpoint and the gate has to be
 * on the action, not on the page that renders its form.
 */
import postgres from "postgres"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"

import {
  createAccount,
  endFixtures,
  FIXTURE_PASSWORD,
  readActivityLog,
  seedOrganization,
  type TestAccount,
  type TestOrganization,
} from "../../../tests/fixtures"

const request = vi.hoisted(() => ({ headers: new Headers() }))

vi.mock("next/headers", () => ({
  headers: () => Promise.resolve(request.headers),
}))

vi.mock("next/cache", () => ({
  revalidatePath: () => undefined,
  revalidateTag: () => undefined,
}))

const { ADMIN_ACTION_IDLE } = await import("@/app/admin/_actions/state")
const userActions = await import("@/app/admin/_actions/users")
const { anonymizedEmail } = await import("./payloads")
const { sharedDatabaseUrl, unique } = await import("../../../tests/scratch-db")

const sql = postgres(sharedDatabaseUrl(), { max: 4, onnotice: () => {} })

let ipCounter = 0
function as(headers: Headers): void {
  ipCounter = (ipCounter + 1) % 250
  const next = new Headers(headers)
  next.set("cf-connecting-ip", `198.51.100.${ipCounter + 1}`)
  request.headers = next
}

function fd(entries: Record<string, string>): FormData {
  const data = new FormData()
  for (const [key, value] of Object.entries(entries)) data.set(key, value)
  return data
}

const anonymize = (entries: Record<string, string>) =>
  userActions.anonymizeUserAction(ADMIN_ACTION_IDLE, fd(entries))

type UserRow = {
  email: string
  name: string
  image: string | null
  is_staff: boolean
  email_verified: boolean
  two_factor_enabled: boolean
  disabled_at: Date | null
}

async function readUser(userId: string): Promise<UserRow | undefined> {
  const [row] = await sql<UserRow[]>`
    SELECT email, name, image, is_staff, email_verified, two_factor_enabled,
           disabled_at
      FROM app_user WHERE id = ${userId}
  `
  return row
}

async function countRows(table: string, userId: string): Promise<number> {
  const [row] = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM ${sql(table)} WHERE user_id = ${userId}
  `
  return row?.n ?? 0
}

/** Can anyone still sign in as this address with the right password? */
async function canSignIn(email: string): Promise<boolean> {
  const { betaAuth } = await import("@/lib/auth/server")
  const response = await betaAuth().api.signInEmail({
    body: { email, password: FIXTURE_PASSWORD },
    asResponse: true,
  })
  return response.ok
}

let office: TestAccount
let book: TestOrganization

beforeAll(async () => {
  office = await createAccount({ staff: true })
  book = await seedOrganization()
})

afterAll(async () => {
  await sql.end({ timeout: 5 })
  await endFixtures()
})

describe("anonymizing an account", () => {
  it("destroys the identity and the credential, and keeps the record", async () => {
    const person = await createAccount()
    await sql`
      INSERT INTO organization_membership (organization_id, user_id, role)
      VALUES (${book.organizationId}, ${person.userId}, 'member')
    `
    // A book act this person is answerable for. It is the thing that must
    // survive, and the thing that pins the row against deletion.
    await sql`
      INSERT INTO activity_log (
        organization_id, actor_kind, actor_user_id, action, entity_kind
      )
      VALUES (
        ${book.organizationId}, 'user', ${person.userId}, 'filing.upsert',
        'filing'
      )
    `
    // An unconsumed link addressed to the old address — the sharpest survivor,
    // because consuming one is how somebody BECOMES the identity it names.
    await sql`
      INSERT INTO user_setup_token (
        purpose, token_hash, email, issued_by_user_id, expires_at
      )
      VALUES (
        'password_reset', ${"a".repeat(64)}, ${person.email}, ${office.userId},
        now() + interval '1 day'
      )
    `

    expect(await canSignIn(person.email)).toBe(true)

    as(office.headers)
    expect(
      await anonymize({
        userId: person.userId,
        confirmEmail: person.email,
      }),
    ).toMatchObject({ status: "ok", message: "admin.okUserAnonymized" })

    // --- the identity is gone -------------------------------------------
    const row = await readUser(person.userId)
    expect(row?.email).toBe(anonymizedEmail(person.userId))
    expect(row?.name).toBe("")
    expect(row?.image).toBeNull()
    expect(row?.is_staff).toBe(false)
    expect(row?.email_verified).toBe(false)
    expect(row?.two_factor_enabled).toBe(false)
    expect(row?.disabled_at).not.toBeNull()

    // --- and so is every way back in --------------------------------------
    expect(await countRows("auth_account", person.userId)).toBe(0)
    expect(await countRows("auth_session", person.userId)).toBe(0)
    expect(await countRows("two_factor", person.userId)).toBe(0)
    expect(await canSignIn(person.email)).toBe(false)

    const [link] = await sql<{ revoked_at: Date | null }[]>`
      SELECT revoked_at FROM user_setup_token WHERE email = ${person.email}
    `
    expect(link?.revoked_at).not.toBeNull()

    // --- the record survives ----------------------------------------------
    const log = await readActivityLog(book.organizationId)
    expect(
      log.filter(
        (entry) =>
          entry.action === "filing.upsert" &&
          entry.actor_user_id === person.userId,
      ),
    ).toHaveLength(1)

    const memberships = await sql<{ active: boolean }[]>`
      SELECT active FROM organization_membership
       WHERE user_id = ${person.userId}
    `
    // Deactivated, never deleted: "was a member of this book" is part of the
    // same record the log is.
    expect(memberships).toHaveLength(1)
    expect(memberships[0]?.active).toBe(false)
  })

  it("records the erasure itself, in every book that holds the person's history", async () => {
    const second = await seedOrganization()
    const person = await createAccount()
    for (const organizationId of [book.organizationId, second.organizationId]) {
      await sql`
        INSERT INTO organization_membership (organization_id, user_id, role)
        VALUES (${organizationId}, ${person.userId}, 'member')
      `
    }

    as(office.headers)
    expect(
      await anonymize({
        userId: person.userId,
        confirmEmail: person.email,
      }),
    ).toMatchObject({ status: "ok" })

    for (const organizationId of [book.organizationId, second.organizationId]) {
      const entry = (await readActivityLog(organizationId)).find(
        (candidate) =>
          candidate.action === "app_user.anonymize" &&
          candidate.entity_id === person.userId,
      )
      expect(entry, organizationId).toBeDefined()
      // The OFFICE user who acted, never the subject: "who is answerable for
      // this row" has one meaning in this table.
      expect(entry?.actor_kind).toBe("user")
      expect(entry?.actor_user_id).toBe(office.userId)
      expect(entry?.agent_key_id).toBeNull()
      expect(entry?.entity_kind).toBe("app_user")
      // Counts only. The erased address must not be written into the
      // append-only table that outlives it.
      expect(JSON.stringify(entry?.summary)).not.toContain(person.email)
      expect(entry?.summary["credentials_revoked"]).toBe(1)
    }
  })

  it("refuses a confirmation that is not this account's address, and writes nothing", async () => {
    const person = await createAccount()

    as(office.headers)
    expect(
      await anonymize({
        userId: person.userId,
        confirmEmail: `${unique("other")}@example.com`,
      }),
    ).toMatchObject({
      status: "error",
      error: "admin.errorConfirmationMismatch",
    })

    expect((await readUser(person.userId))?.email).toBe(person.email)
    expect(await countRows("auth_account", person.userId)).toBe(1)
    expect(await canSignIn(person.email)).toBe(true)
  })

  it("refuses the operator's own account", async () => {
    const self = await createAccount({ staff: true })

    as(self.headers)
    expect(
      await anonymize({ userId: self.userId, confirmEmail: self.email }),
    ).toMatchObject({ status: "error", error: "admin.errorAnonymizeSelf" })

    expect((await readUser(self.userId))?.email).toBe(self.email)
  })

  it("refuses a book's last owner, and leaves the account intact", async () => {
    const solo = await seedOrganization()

    as(office.headers)
    expect(
      await anonymize({
        userId: solo.members.owner.userId,
        confirmEmail: solo.members.owner.email,
      }),
    ).toMatchObject({ status: "error", error: "admin.errorLastOwner" })

    // The whole transaction rolled back — not just the membership statement
    // that raised. A book left with an owner whose credential is gone would be
    // unreachable by anybody.
    const owner = await readUser(solo.members.owner.userId)
    expect(owner?.email).toBe(solo.members.owner.email)
    expect(owner?.is_staff).toBe(true)
    expect(await countRows("auth_account", solo.members.owner.userId)).toBe(1)
  })

  it("is idempotent, and answers to the tombstone address afterwards", async () => {
    const person = await createAccount()

    as(office.headers)
    expect(
      await anonymize({ userId: person.userId, confirmEmail: person.email }),
    ).toMatchObject({ status: "ok", message: "admin.okUserAnonymized" })

    // The old address no longer identifies anybody, so it is no longer an
    // accepted confirmation.
    expect(
      await anonymize({ userId: person.userId, confirmEmail: person.email }),
    ).toMatchObject({
      status: "error",
      error: "admin.errorConfirmationMismatch",
    })

    // The address the grid now shows is, and running again changes nothing.
    expect(
      await anonymize({
        userId: person.userId,
        confirmEmail: anonymizedEmail(person.userId),
      }),
    ).toMatchObject({
      status: "ok",
      message: "admin.okUserAlreadyAnonymized",
    })
  })

  /**
   * The tombstone-squatter denial of service. `app_user.email` is UNIQUE, so an
   * account parked on a victim's future tombstone would make that victim's
   * erasure fail on 23505 — a GDPR Art. 17 request that cannot be executed,
   * surfacing as an opaque "the database refused it".
   */
  it("refuses to provision an account on another account's tombstone", async () => {
    const victim = await createAccount()
    const squat = anonymizedEmail(victim.userId)

    as(office.headers)
    expect(
      await userActions.createUserAction(
        ADMIN_ACTION_IDLE,
        fd({ email: squat, name: "Squatter" }),
      ),
    ).toMatchObject({ status: "error", error: "admin.errorReservedEmail" })

    // Upper-case spelling is the same address once the DB trigger lowercases it.
    expect(
      await userActions.createUserAction(
        ADMIN_ACTION_IDLE,
        fd({ email: squat.toUpperCase(), name: "Squatter" }),
      ),
    ).toMatchObject({ status: "error", error: "admin.errorReservedEmail" })

    // Nor through a setup link, whose consume path CREATES an app_user at the
    // token's address.
    expect(
      await userActions.issueUserLinkAction(
        ADMIN_ACTION_IDLE,
        fd({ email: squat, activated: "false" }),
      ),
    ).toMatchObject({ status: "error" })

    // And the victim is still erasable, which is the property all of that is for.
    expect(
      await anonymize({ userId: victim.userId, confirmEmail: victim.email }),
    ).toMatchObject({ status: "ok", message: "admin.okUserAnonymized" })
  })

  it("floors the squat in the database, not only in the action", async () => {
    const victim = await createAccount()

    // Straight past every application check, as a fixture or a psql session
    // would. `app_user_tombstone_guard` (migration 0021) is what stops it.
    await expect(
      sql`
        INSERT INTO app_user (email, name)
        VALUES (${anonymizedEmail(victim.userId)}, 'Squatter')
      `,
    ).rejects.toThrow(/another account's anonymized address/)

    // A row wearing its OWN tombstone is the legal case the guard must allow —
    // it is what anonymization itself writes.
    expect(
      await (async () => {
        as(office.headers)
        return anonymize({
          userId: victim.userId,
          confirmEmail: victim.email,
        })
      })(),
    ).toMatchObject({ status: "ok" })
  })

  it("takes the trusted devices and pending OTPs with it", async () => {
    const person = await createAccount()
    // Both shapes Better Auth writes: the subject in `identifier` (the e-mail
    // flows) and the subject in `value` (the token flows).
    await sql`
      INSERT INTO auth_verification (identifier, value, expires_at)
      VALUES
        (${`email-verification-${person.email}`}, 'otp', now() + interval '1 hour'),
        (${"trust-device-abc"}, ${person.userId}, now() + interval '30 days')
    `

    as(office.headers)
    expect(
      await anonymize({ userId: person.userId, confirmEmail: person.email }),
    ).toMatchObject({ status: "ok" })

    const [left] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM auth_verification
       WHERE identifier LIKE ${`%${person.email}%`}
          OR value LIKE ${`%${person.userId}%`}
    `
    expect(left?.n).toBe(0)
  })

  it("does not widen the auth_verification purge past this account's own address", async () => {
    // `_` is a LIKE wildcard for "any one character", and it is a legal e-mail
    // local-part character too. An unescaped pattern built from this address
    // would ALSO delete a lookalike sibling's pending verification — the
    // over-erasure `escapeLikePattern` (shared with `documents.ts`'s search
    // filter) exists to close.
    const base = unique("erase")
    const email = `${base}_test@example.com`
    const lookalike = `${base}Xtest@example.com`
    const person = await createAccount({ email })

    await sql`
      INSERT INTO auth_verification (identifier, value, expires_at)
      VALUES
        (${`email-verification-${email}`}, 'otp', now() + interval '1 hour'),
        (${`email-verification-${lookalike}`}, 'otp', now() + interval '1 hour')
    `

    as(office.headers)
    expect(
      await anonymize({ userId: person.userId, confirmEmail: email }),
    ).toMatchObject({ status: "ok" })

    const [own] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM auth_verification
       WHERE identifier = ${`email-verification-${email}`}
    `
    expect(own?.n).toBe(0)

    const [sibling] = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM auth_verification
       WHERE identifier = ${`email-verification-${lookalike}`}
    `
    expect(sibling?.n).toBe(1)
  })

  it("refuses a malformed request before it reads anything", async () => {
    as(office.headers)
    for (const entries of [
      { userId: "not-a-uuid", confirmEmail: "x@example.com" },
      { userId: book.members.member.userId, confirmEmail: "" },
    ]) {
      expect(await anonymize(entries), JSON.stringify(entries)).toMatchObject({
        status: "error",
        error: "admin.errorInvalidInput",
      })
    }
  })
})
