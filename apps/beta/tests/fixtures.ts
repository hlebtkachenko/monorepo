/**
 * Shared seed builders for the beta suites.
 *
 * The tenancy tests need the same world every time — two organizations, one
 * account per role in each, a live session for each of them — and every later
 * PR that adds an org-scoped surface needs the same world plus its own rows.
 * Building it here once means a new route's cross-org case costs three lines in
 * a spec file instead of a fresh fixture.
 *
 * Accounts are given their credential through Better Auth's internal adapter,
 * the same call the setup-link consume makes (`lib/auth/setup-token.ts`). The
 * link flow itself — the only door in production — is tested end to end in
 * `lib/auth/setup-token.test.ts`; reproducing it here would make every fixture
 * pay for a token round trip to reach the same row.
 */
import postgres from "postgres"

import type { BetaOrgRole } from "@/db/schema"

import { sharedDatabaseUrl, unique } from "./scratch-db"

// Must be set before `lib/auth/server` is evaluated, which is why every import
// of it below is dynamic.
process.env["BETTER_AUTH_SECRET"] ??= `beta-test-secret-${"x".repeat(40)}`
process.env["BETTER_AUTH_URL"] ??= "http://localhost:3200"

const PASSWORD = "Beta-Heslo-2026!"

let client: postgres.Sql | undefined

function db(): postgres.Sql {
  client ??= postgres(sharedDatabaseUrl(), { max: 6, onnotice: () => {} })
  return client
}

/** Call from `afterAll`. */
export async function endFixtures(): Promise<void> {
  if (!client) return
  await client.end({ timeout: 5 })
  client = undefined
}

export type TestAccount = {
  userId: string
  email: string
  isStaff: boolean
  /** Request headers carrying this account's live session cookie. */
  headers: Headers
}

export type TestOrganization = {
  organizationId: string
  slug: string
  /** One signed-in account per role. The owner is office staff, as the DB requires. */
  members: Record<BetaOrgRole, TestAccount>
}

/** Headers for a visitor with no session at all. */
export function anonymousHeaders(): Headers {
  return new Headers()
}

/**
 * Headers carrying a session cookie under Better Auth's DEFAULT name — what
 * the main product sets for `.afframe.com`, which physically reaches this host
 * (Advisor blocker B4-2). Beta must treat it as noise.
 */
export function foreignCookieHeaders(value: string): Headers {
  return new Headers({ cookie: `__Secure-better-auth.session_token=${value}` })
}

export async function createAccount(
  options: { staff?: boolean; email?: string } = {},
): Promise<TestAccount> {
  const sql = db()
  const email = options.email ?? `${unique("user")}@example.com`
  const isStaff = options.staff ?? false

  const [row] = await sql<{ id: string }[]>`
    INSERT INTO app_user (email, name, is_staff)
    VALUES (${email}, 'Testovací uživatel', ${isStaff})
    RETURNING id
  `
  const userId = row!.id

  const { betaAuth } = await import("@/lib/auth/server")
  const ctx = await betaAuth().$context
  await ctx.internalAdapter.linkAccount({
    userId,
    providerId: "credential",
    accountId: userId,
    password: await ctx.password.hash(PASSWORD),
  })

  return { userId, email, isStaff, headers: await signIn(email) }
}

/** A live session for `email`, as request headers. */
async function signIn(email: string): Promise<Headers> {
  const { betaAuth } = await import("@/lib/auth/server")
  const { BETA_SESSION_COOKIE_NAME } = await import("@/lib/auth/policy")

  const response = await betaAuth().api.signInEmail({
    body: { email, password: PASSWORD },
    asResponse: true,
  })
  const cookie = response.headers
    .getSetCookie()
    .find((c) => c.startsWith(BETA_SESSION_COOKIE_NAME))
  if (!cookie) throw new Error(`fixture: no session cookie for ${email}`)

  return new Headers({ cookie: cookie.split(";")[0]! })
}

/** The raw token value inside a session cookie header, for negative tests. */
export function sessionTokenOf(headers: Headers): string {
  const cookie = headers.get("cookie") ?? ""
  return cookie.slice(cookie.indexOf("=") + 1)
}

export async function createOrganization(
  options: { slug?: string; archived?: boolean; isDemo?: boolean } = {},
): Promise<{ organizationId: string; slug: string }> {
  const sql = db()
  const slug = options.slug ?? unique("org-")
  const [row] = await sql<{ id: string }[]>`
    INSERT INTO organization (slug, legal_name, is_demo, archived_at)
    VALUES (
      ${slug},
      'Testovací s.r.o.',
      ${options.isDemo ?? false},
      ${options.archived ? sql`now()` : null}
    )
    RETURNING id
  `
  return { organizationId: row!.id, slug }
}

export async function addMembership(
  organizationId: string,
  userId: string,
  role: BetaOrgRole,
  options: { active?: boolean } = {},
): Promise<void> {
  const sql = db()
  await sql`
    INSERT INTO organization_membership (organization_id, user_id, role, active)
    VALUES (${organizationId}, ${userId}, ${role}, ${options.active ?? true})
  `
}

/**
 * An organization with one signed-in account per role.
 *
 * The owner is created with `is_staff` because the DB trigger
 * `organization_membership_owner_requires_staff` refuses an owner membership
 * for anyone else — owner-ness can only originate from the office.
 */
export async function seedOrganization(
  options: { slug?: string } = {},
): Promise<TestOrganization> {
  const { organizationId, slug } = await createOrganization(options)

  const roles: BetaOrgRole[] = ["owner", "admin", "member", "guest"]
  const entries = await Promise.all(
    roles.map(async (role) => {
      const account = await createAccount({ staff: role === "owner" })
      await addMembership(organizationId, account.userId, role)
      return [role, account] as const
    }),
  )

  return {
    organizationId,
    slug,
    members: Object.fromEntries(entries) as Record<BetaOrgRole, TestAccount>,
  }
}

export async function archiveOrganization(
  organizationId: string,
): Promise<void> {
  await db()`UPDATE organization SET archived_at = now() WHERE id = ${organizationId}`
}

export async function disableAccount(userId: string): Promise<void> {
  await db()`UPDATE app_user SET disabled_at = now() WHERE id = ${userId}`
}

export async function setMembershipActive(
  organizationId: string,
  userId: string,
  active: boolean,
): Promise<void> {
  await db()`
    UPDATE organization_membership SET active = ${active}
     WHERE organization_id = ${organizationId} AND user_id = ${userId}
  `
}

export async function setStaff(
  userId: string,
  isStaff: boolean,
): Promise<void> {
  await db()`UPDATE app_user SET is_staff = ${isStaff} WHERE id = ${userId}`
}
