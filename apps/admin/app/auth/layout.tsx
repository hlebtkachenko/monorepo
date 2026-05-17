import type { ReactNode } from "react"

/**
 * Ungated layout for the admin auth pages (login, forgot/reset password).
 * Sits outside the `(gated)` route group, so no session check runs here.
 */
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-svh items-center justify-center p-6">
      <div className="w-full max-w-sm">{children}</div>
    </div>
  )
}
