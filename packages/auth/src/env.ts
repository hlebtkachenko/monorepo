/**
 * Server-side env accessors for @workspace/auth.
 *
 * Centralised so the same fail-closed semantics apply wherever a value is
 * read (server config, onboarding actions, invite scripts). All accessors
 * are intentionally call-time (no module-load IIFE) so tests can rotate
 * env between cases without `vi.resetModules()`.
 */

const IS_PROD = process.env.NODE_ENV === "production"

/**
 * Absolute base URL of the web app. Used for password-reset / verification /
 * invite links. Must be set in production; throws if missing. In dev this
 * falls back to `http://localhost:3000` for convenience.
 */
export function getBetterAuthUrl(): string {
  const raw = process.env.BETTER_AUTH_URL?.trim()
  if (raw) return raw
  if (IS_PROD) {
    throw new Error(
      "BETTER_AUTH_URL is required in production. Set it to the absolute base URL of the web app.",
    )
  }
  return "http://localhost:3000"
}
