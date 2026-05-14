import type { ReactNode } from "react"

/**
 * Onboarding route group layout — thin pass-through.
 *
 * Each step page composes its own <OnboardingShell step="..."> so the
 * progress meter + back link reflect the route. Phase 7 may hoist the
 * shell into this layout if it stays stable across the wizard.
 */
export default function OnboardingLayout({
  children,
}: {
  children: ReactNode
}) {
  return <div className="min-h-svh bg-background">{children}</div>
}
