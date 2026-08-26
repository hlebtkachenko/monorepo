"use client"

import { createAuthClient } from "better-auth/react"
import { twoFactorClient } from "better-auth/client/plugins"

/**
 * Browser client for the sign-in form and the Nastavení › Účet controls.
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
 * limiter entirely. Every credential-bearing control in Nastavení › Účet
 * (password change, TOTP enrol / verify / disable, backup-code regeneration)
 * takes the same route for the same reason — the budgets that make a six-digit
 * code worth anything live in `BETA_RATE_LIMIT_RULES`, and only the HTTP
 * surface consults them.
 *
 * `twoFactorClient()` is the browser half of the server's `twoFactor()` plugin.
 * It contributes the `twoFactor.*` namespace AND the fetch hook that turns a
 * `{ twoFactorRedirect: true }` sign-in response into something the caller can
 * branch on. No `twoFactorPage` / `onTwoFactorRedirect` is passed: those force a
 * full page reload, and beta's sign-in form swaps to its code step in place.
 */
// The explicit annotation is not decoration: this app maps `@/*` onto its own
// root, so TypeScript would name the inferred type through
// `@/node_modules/better-auth/...` and refuse it as non-portable (TS2883).
export const betaAuthClient: ReturnType<
  typeof createAuthClient<{ plugins: [ReturnType<typeof twoFactorClient>] }>
> = createAuthClient({ plugins: [twoFactorClient()] })
