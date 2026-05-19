/**
 * freshAge — session-age freshness check for sensitive server actions.
 *
 * Sensitive operations (password change, email change, MFA enable/disable)
 * require the session to have been authenticated within the last 24 hours.
 * A stale session must re-authenticate before proceeding.
 *
 * The `now` parameter exists for testability (clock injection). Production
 * callers pass no argument, defaulting to `Date.now()`.
 */

export const FRESH_AGE_MS = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Return true when the session's last-updated timestamp is within the
 * freshness window, false when the session is stale.
 *
 * @param updatedAt - The `session.session.updatedAt` value from Better Auth.
 * @param now - Injectable clock for testing. Defaults to `Date.now()`.
 */
export function isFreshSession(
  updatedAt: Date | string,
  now: number = Date.now(),
): boolean {
  const age = now - new Date(updatedAt).getTime()
  return age <= FRESH_AGE_MS
}
