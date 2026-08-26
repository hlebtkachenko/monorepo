import { requireBetaSession } from "@/lib/auth/session"
import { requireTotpEnrolment } from "@/lib/data/account"

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
 *
 * FORCED TOTP (PR 21, spec §2.0.1 / §2.10). An office account — one holding an
 * active owner membership, or `is_staff` — that has not enrolled a second factor
 * is redirected to `/zabezpeceni` from HERE, which is the parent of every
 * authenticated client surface: the root picker, every `[orgSlug]` page, and
 * everything under them. /admin has the same gate in its own layout, since it
 * lives outside this group. The mandate is deliberately NOT a database
 * constraint — a constraint would lock the account out of the enrolment page
 * too.
 */
export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await requireBetaSession()
  await requireTotpEnrolment()
  return <>{children}</>
}
