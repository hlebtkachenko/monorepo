import type { ReactNode } from "react"

/**
 * Auth route group layout.
 *
 * Centered card chrome for all anon + onboarding flows: login, signup,
 * invite, password reset, MFA, no-access.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="w-full max-w-md">{children}</div>
    </div>
  )
}
