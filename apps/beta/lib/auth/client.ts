"use client"

import { createAuthClient } from "better-auth/react"

/**
 * Browser client for the sign-in form.
 *
 * No `baseURL`: the client infers the current origin, which is always correct
 * for a single-origin app. Passing `NEXT_PUBLIC_BETTER_AUTH_URL` would be a
 * trap — `NEXT_PUBLIC_*` is inlined at BUILD time, and the beta image is built
 * without it (the CDK stack supplies it as a runtime container variable), so
 * the constant would bake in as `undefined` and never recover.
 *
 * Sign-in goes through this client rather than a Server Action on purpose:
 * Better Auth's rate limiter runs inside its HTTP handler, so a direct
 * `auth.api.signInEmail(...)` from a Server Action would silently skip the
 * limiter entirely.
 */
// The explicit annotation is not decoration: this app maps `@/*` onto its own
// root, so TypeScript would name the inferred type through
// `@/node_modules/better-auth/...` and refuse it as non-portable (TS2883).
export const betaAuthClient: ReturnType<typeof createAuthClient> =
  createAuthClient()
