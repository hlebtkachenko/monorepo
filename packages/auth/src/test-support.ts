/**
 * Test-support glue for `@workspace/auth`.
 *
 * `packages/db` deliberately does not import `@workspace/auth` — that would
 * invert the `auth -> db` dependency. So the loginable-user seed helper in
 * `@workspace/db/tests/fixtures` (`seedWorkspaceWithOwner`) takes an injected
 * `signUp` callback instead. This module is the canonical implementation of
 * that callback plus a matching sign-in helper, used by:
 *
 *   - the auth round-trip verification test (`packages/auth/src/*.test.ts`)
 *   - the web E2E Playwright `globalSetup` (`apps/web/playwright.config.ts`)
 *
 * IMPORTANT — import order. The Better Auth instance in `./server` binds to
 * the `@workspace/db` singleton `db`, which reads `DATABASE_URL` lazily on its
 * first SQL call. Callers MUST set `DATABASE_URL` (to the testcontainer's
 * app_user URL) BEFORE importing this module, e.g. via a dynamic
 * `await import("@workspace/auth/test-support")`. Importing it eagerly at the
 * top of a file that later sets `DATABASE_URL` will bind `db` to the wrong (or
 * missing) URL.
 *
 * This module reuses the production `auth` instance verbatim, so the seeded
 * credential is hashed and stored exactly as a real sign-up would produce —
 * there is no test-only auth config to drift from production.
 */

import { auth } from "./server"

/**
 * Callback shape consumed by `seedWorkspaceWithOwner` in
 * `@workspace/db/tests/fixtures`. Kept structurally identical to the `SeedSignUp`
 * type declared there — re-declared locally rather than imported so this module
 * does not depend on `@workspace/db`'s test-only `tests/` path (which is not in
 * the package `exports` map).
 */
export type SeedSignUp = (input: {
  email: string
  password: string
  name: string
}) => Promise<{ userId: string }>

/**
 * `SeedSignUp` implementation backed by Better Auth's real `signUpEmail` API.
 *
 * `signUpEmail` creates the `app_user` identity row AND the `auth_account` row
 * carrying the password hashed with Better Auth's configured hasher
 * (provider_id = 'credential'). Both tables are RLS-free, so this runs fine on
 * the app_user connection the testcontainer hands out as `DATABASE_URL`.
 */
export const betterAuthSignUp: SeedSignUp = async ({
  email,
  password,
  name,
}) => {
  const result = await auth.api.signUpEmail({
    body: { email, password, name },
  })
  return { userId: result.user.id }
}

export interface SignInResult {
  ok: boolean
  /** Better Auth session token, when sign-in succeeded. */
  token: string | null
  /** Resolved user id, when sign-in succeeded. */
  userId: string | null
}

/**
 * Sign in with an email/password credential and confirm a session is issued.
 *
 * Drives Better Auth's real `signInEmail` API. A returned `token` proves the
 * credential is genuine end-to-end: the stored hash verified and a session row
 * was created. Used by the auth round-trip verification test.
 */
export async function signInWithPassword(
  email: string,
  password: string,
): Promise<SignInResult> {
  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
    })
    return {
      ok: Boolean(result.token),
      token: result.token ?? null,
      userId: result.user?.id ?? null,
    }
  } catch {
    return { ok: false, token: null, userId: null }
  }
}
