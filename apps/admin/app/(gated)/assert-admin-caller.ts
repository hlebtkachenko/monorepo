import { headers } from "next/headers"

import { auth } from "@workspace/auth/server"

import { checkAllowlist } from "./check-allowlist"

/**
 * Guard for server actions under the `(gated)` segment. Next.js layouts do
 * NOT run for server-action POST invocations — `(gated)/layout.tsx` protects
 * page renders only — so every action must call this as its first statement.
 *
 * Throws unless the caller holds a valid Better Auth session for an
 * allowlisted admin user. Always throws in production: the dev-dashboard
 * actions this guards are dev-only surfaces.
 */
export async function assertAdminCaller(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    throw new Error("Not available in production")
  }
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    throw new Error("Unauthorized")
  }
  const { allowed } = await checkAllowlist(session.user.id)
  if (!allowed) {
    throw new Error("Unauthorized")
  }
}
