/**
 * Auth round-trip verification for the loginable-user seed.
 *
 * AFF-115 / E14a — proves `seedWorkspaceWithOwner` produces a credential that
 * genuinely completes a Better Auth sign-in. A wrong seed (e.g. a hand-hashed
 * password) would silently break every downstream E2E that depends on a
 * logged-in user, so this test exercises the full path:
 *
 *   1. boot a disposable Postgres 18 testcontainer (migrations applied)
 *   2. point DATABASE_URL at it BEFORE importing any db/auth module
 *   3. run seedWorkspaceWithOwner with the real `betterAuthSignUp` callback
 *   4. sign in with the returned email + password via Better Auth
 *   5. assert a session token is issued and the tenant graph is intact
 *
 * The db/auth modules are imported dynamically AFTER the env is set because
 * `@workspace/db`'s client binds DATABASE_URL on first use — a static import
 * at the top of the file would bind too early.
 */

import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { bootPostgres18 } from "@workspace/testcontainers"
import type { BootResult } from "@workspace/testcontainers"

// Better Auth's server module validates BETTER_AUTH_SECRET at construction.
// Set a 32+ byte test secret before the dynamic import below picks it up.
process.env["BETTER_AUTH_SECRET"] =
  process.env["BETTER_AUTH_SECRET"] ??
  "auth-seed-verification-secret-0123456789ab"
process.env["NODE_ENV"] = process.env["NODE_ENV"] ?? "test"

let boot: BootResult

beforeAll(async () => {
  boot = await bootPostgres18()
  // The db client + Better Auth instance bind DATABASE_URL lazily. Set it now,
  // before the dynamic imports inside the test, so both target the container.
  process.env["DATABASE_URL"] = boot.userUrl
  process.env["DATABASE_DIRECT_URL"] = boot.adminUrl
}, 120_000)

afterAll(async () => {
  if (boot?.container) await boot.container.stop()
})

describe("seedWorkspaceWithOwner — auth round-trip", () => {
  it("seeds a credential that completes a real Better Auth sign-in", async () => {
    // Dynamic imports: DATABASE_URL is now set, so db/auth bind correctly.
    const { adminClient, seedWorkspaceWithOwner } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp, signInWithPassword } =
      await import("./test-support")

    const sql = adminClient()
    try {
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "round-trip-owner@test.invalid",
        password: "RoundTripPassw0rd!",
      })

      // The seed wrote a genuine credential row.
      const [account] = await sql<
        Array<{ provider_id: string; password: string | null }>
      >`
        SELECT provider_id, password FROM auth_account WHERE user_id = ${seed.userId}::uuid
      `
      expect(account).toBeDefined()
      expect(account!.provider_id).toBe("credential")
      expect(account!.password).toBeTruthy()

      // The owner workspace_membership exists with role 'owner'.
      const memberships = await sql<Array<{ role: string; active: boolean }>>`
        SELECT role, active FROM workspace_membership
        WHERE workspace_id = ${seed.workspaceId}::uuid AND user_id = ${seed.userId}::uuid
      `
      expect(memberships).toHaveLength(1)
      expect(memberships[0]!.role).toBe("owner")
      expect(memberships[0]!.active).toBe(true)

      // THE round-trip: sign in with the seeded credential.
      const signIn = await signInWithPassword(seed.email, seed.password)
      expect(signIn.ok).toBe(true)
      expect(signIn.token).toBeTruthy()
      expect(signIn.userId).toBe(seed.userId)

      // A session row was persisted for the seeded user.
      const sessions = await sql<Array<{ count: string }>>`
        SELECT count(*)::text AS count FROM auth_session
        WHERE user_id = ${seed.userId}::uuid
      `
      expect(Number(sessions[0]!.count)).toBeGreaterThan(0)
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)

  it("rejects sign-in with a wrong password", async () => {
    const { adminClient, seedWorkspaceWithOwner } =
      await import("@workspace/db/tests/fixtures")
    const { betterAuthSignUp, signInWithPassword } =
      await import("./test-support")

    const sql = adminClient()
    try {
      const seed = await seedWorkspaceWithOwner(sql, {
        signUp: betterAuthSignUp,
        email: "wrong-password-owner@test.invalid",
        password: "CorrectPassw0rd!",
      })
      const bad = await signInWithPassword(seed.email, "WrongPassw0rd!!")
      expect(bad.ok).toBe(false)
      expect(bad.token).toBeNull()
    } finally {
      await sql.end({ timeout: 5 })
    }
  }, 120_000)
})
