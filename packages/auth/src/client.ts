import { createAuthClient } from "better-auth/react"
import { adminClient, twoFactorClient } from "better-auth/client/plugins"

/**
 * Better Auth React client.
 *
 * Use from client components for `signIn.email`, `signOut`, `useSession`,
 * two-factor enrollment + verification, and admin operations. The server
 * instance (`./server`) owns the actual auth state; this client speaks to
 * the catchall route at `/api/auth/[...all]`.
 *
 * `baseURL` is optional in same-origin browser contexts (Better Auth
 * resolves to `window.location.origin`), but explicit makes intent clear.
 */
export const authClient = createAuthClient({
  baseURL: process.env.NEXT_PUBLIC_BETTER_AUTH_URL,
  plugins: [adminClient(), twoFactorClient()],
})

export const { signIn, signUp, signOut, useSession, getSession, twoFactor } =
  authClient
