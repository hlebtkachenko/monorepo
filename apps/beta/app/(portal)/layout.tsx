import { requireBetaSession } from "@/lib/auth/session"

/**
 * Every route inside the portal requires a session; none of them renders
 * without one.
 *
 * The gate is here rather than in middleware on purpose. Middleware's cheap
 * check is `getSessionCookie()`, which matches Better Auth's DEFAULT cookie
 * prefix — and the main product's `.afframe.com` session cookie reaches this
 * host on every request, so that check would accept a prod cookie as a beta
 * session (Advisor blocker B4-2). `requireBetaSession()` verifies the token
 * against beta's own secret and beta's own `auth_session` table instead. Sign-in
 * and the one-time link flows live OUTSIDE this group, so no portal page ever
 * renders for an unauthenticated visitor.
 *
 * NO SHELL HERE (PR 09). The full app-shell (rail + org switcher) needs an
 * organization to point its rail at, which this layout — the parent of both
 * the pre-org root picker AND `[orgSlug]/...` — does not have. `BetaShell`
 * now mounts one level down, in `[orgSlug]/layout.tsx`, which is the first
 * point in the tree that has resolved one. The root picker
 * (`app/(portal)/page.tsx`) draws its own minimal chrome instead.
 */
export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await requireBetaSession()
  return <>{children}</>
}
