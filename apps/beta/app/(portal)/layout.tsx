import { requireBetaSession } from "@/lib/auth/session"

import { BetaShell } from "../_shell/beta-shell"

/**
 * Every route inside the portal renders in the app shell, and none of them
 * renders without a session.
 *
 * The gate is here rather than in middleware on purpose. Middleware's cheap
 * check is `getSessionCookie()`, which matches Better Auth's DEFAULT cookie
 * prefix — and the main product's `.afframe.com` session cookie reaches this
 * host on every request, so that check would accept a prod cookie as a beta
 * session (Advisor blocker B4-2). `requireBetaSession()` verifies the token
 * against beta's own secret and beta's own `auth_session` table instead. Sign-in
 * and the one-time link flows live OUTSIDE this group, so the shell is never
 * drawn for an unauthenticated visitor.
 */
export default async function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  await requireBetaSession()
  return <BetaShell>{children}</BetaShell>
}
