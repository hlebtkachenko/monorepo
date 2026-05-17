import { createAuthClient } from "better-auth/react"
import {
  adminClient,
  magicLinkClient,
  twoFactorClient,
} from "better-auth/client/plugins"

/**
 * Better Auth React client.
 *
 * Use from client components for `signIn.email`, `signOut`, `useSession`,
 * two-factor enrollment + verification, and admin operations. The server
 * instance (`./server`) owns the actual auth state; this client speaks to
 * the catchall route at `/api/auth/[...all]`.
 *
 * baseURL is intentionally omitted so Better Auth defaults to
 * `window.location.origin` — every `pnpm dev --port N` instance and every
 * deployed origin gets the right URL without an extra env var to drift
 * from PORT. Same-origin only; no cross-origin auth surface today.
 */
export const authClient = createAuthClient({
  plugins: [adminClient(), magicLinkClient(), twoFactorClient()],
})

export const { signIn, signUp, signOut, useSession, getSession, twoFactor } =
  authClient
