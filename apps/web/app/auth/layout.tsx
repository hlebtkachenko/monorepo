import type { ReactNode } from "react"

/**
 * Auth route group layout.
 *
 * Thin pass-through wrapper. Each auth page owns its own `<AuthShell>`
 * (split-grid form + aside) so the layout doesn't constrain content
 * width. Phase 7 will hoist the shared shell + header/footer wiring into
 * this layout once every auth route lands on the new shell.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-svh bg-background">{children}</div>
}
