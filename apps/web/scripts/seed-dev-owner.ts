/**
 * Mint the shared demo login for local development.
 *
 * Every isolated Conductor workspace gets its OWN Postgres database, and each
 * one is seeded with the SAME demo owner (owner@example.com / passwordpassword)
 * so you can sign in to any workspace's dev server without thinking about
 * credentials.
 *
 * This mints ONLY the Better Auth credential (the `app_user` identity row + the
 * `auth_account` row holding the scrypt password hash) via the real sign-up
 * API. The scrypt hash is independent of BETTER_AUTH_SECRET, so each workspace's
 * random secret is fine. The tenant graph (workspace + organization `acme`) is
 * added afterwards by `pnpm --filter @workspace/db db:seed`.
 *
 * Idempotent: a duplicate-email error is treated as success.
 *
 * Requires DATABASE_URL + BETTER_AUTH_SECRET in the environment. The Conductor
 * setup script sources the generated apps/web/.env.local before running this.
 */
/* eslint-disable turbo/no-undeclared-env-vars -- dev-only seed script, not a cached turbo task */
import { betterAuthSignUp } from "@workspace/auth/test-support"

const email = process.env.SEED_OWNER_EMAIL ?? "owner@example.com"
const password = process.env.SEED_OWNER_PASSWORD ?? "passwordpassword"
const name = process.env.SEED_OWNER_NAME ?? "Owner"

// This mints a real loginable credential, so refuse to run against anything but
// a local database — guards against accidentally seeding a remote/prod DB.
const dbHost = (() => {
  try {
    return new URL(process.env.DATABASE_URL ?? "").hostname
  } catch {
    return ""
  }
})()
if (!new Set(["localhost", "127.0.0.1", "::1", "[::1]"]).has(dbHost)) {
  console.error(
    `Refusing to seed dev owner: DATABASE_URL host "${dbHost}" is not local.`,
  )
  process.exit(1)
}

try {
  const { userId } = await betterAuthSignUp({ email, password, name })
  console.log(`Minted dev owner ${email} (${userId}).`)
} catch (error) {
  const message = error instanceof Error ? error.message : String(error)
  // Narrow to genuine duplicate signals; a bare "exist" would also match
  // "does not exist" and mask a broken (e.g. unmigrated) DB as idempotent.
  if (/already exists|duplicate key|unique constraint/i.test(message)) {
    console.log(`Dev owner ${email} already exists — skipping.`)
  } else {
    console.error(`Failed to mint dev owner ${email}: ${message}`)
    process.exitCode = 1
  }
}
