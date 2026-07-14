/**
 * Per-workspace dev session-cookie prefix, or `undefined` to keep Better Auth's
 * default cookie name.
 *
 * Browsers scope cookies by host but NOT by port, so every Conductor workspace
 * dev server on `localhost:<port>` otherwise shares one
 * `better-auth.session_token`. Each workspace has its own database + its own
 * `BETTER_AUTH_SECRET`, so a second workspace's cookie overwrites and
 * invalidates the first — the user is silently signed out on the next request.
 *
 * Namespacing the cookie by `$CONDUCTOR_PORT` (the workspace's base port,
 * injected into both the web and the admin dev process — admin runs on
 * `port + 2` but still carries the same base `CONDUCTOR_PORT`, so the two keep
 * sharing a session) gives each workspace its own cookie jar.
 *
 * Production never sets `CONDUCTOR_PORT`, so this returns `undefined` there and
 * the cookie name is unchanged — the isolation is dev-only.
 *
 * `env` is injectable for testing; it defaults to `process.env`.
 */
export function devCookiePrefix(
  env: NodeJS.ProcessEnv = process.env,
): string | undefined {
  if (env.NODE_ENV === "production") return undefined
  return env.CONDUCTOR_PORT ? `better-auth-${env.CONDUCTOR_PORT}` : undefined
}
