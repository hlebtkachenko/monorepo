import { BetaShell } from "../_shell/beta-shell"

/**
 * Every route inside the portal renders in the app shell. Sign-in and the
 * one-time setup-link flow land OUTSIDE this group (their own route group), so
 * the shell is never drawn for an unauthenticated visitor.
 */
export default function PortalLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return <BetaShell>{children}</BetaShell>
}
