import type { ReactNode } from "react"

/**
 * Member onboarding route group layout — thin pass-through.
 *
 * Each step page composes its own <MemberOnboardingShell step="..."> so
 * the progress meter reflects the route. Phase 7 may hoist the shell
 * into this layout if it stabilizes.
 */
export default function MemberOnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  return <div className="min-h-svh bg-background">{children}</div>
}
