import "server-only"

import { requireAdminSession, type AdminSessionContext } from "./admin-session"
import type { StaffRole } from "./staff-role"

/**
 * Admin capability → required staff roles. Each capability lists every role
 * permitted to invoke it. Owner is always in the list (escape hatch).
 *
 * Sensitive capabilities should ALSO be wired into `STEP_UP` in
 * `capabilities.ts` so a fresh re-auth is required at action entry, even
 * when the role check would otherwise pass.
 */
export const ADMIN_CAPABILITIES: Record<string, ReadonlyArray<StaffRole>> = {
  "admin:read": [
    "owner",
    "admin",
    "developer",
    "designer",
    "support",
    "security",
    "guest",
  ],
  "admin:user.write": ["owner", "admin", "support", "security"],
  "admin:impersonate": ["owner", "admin", "security"],
  "admin:flag.write": ["owner", "admin", "developer"],
  "admin:org.member.write": ["owner", "admin", "support"],
  // Minting a signup token spawns a whole new workspace+owner — higher blast
  // radius than inviting into an existing org, so support is excluded.
  "admin:signup_token": ["owner", "admin"],
  "admin:api_key.revoke": ["owner", "admin", "developer", "security"],
  "admin:session.revoke": ["owner", "admin", "security"],
  "admin:outbox.retry": ["owner", "admin", "developer"],
  "admin:role.write": ["owner"],
  "admin:sql.write": ["owner"],
  "admin:kill_switch": ["owner"],
}

/**
 * Returns the authed staff context if the user's staff role is in the
 * capability's allow-list. Otherwise throws `Error("forbidden: capability
 * <cap>")`. Every mutating admin server action calls this as its first
 * statement.
 */
export async function requireAdminCapability(
  cap: string,
): Promise<AdminSessionContext> {
  const ctx = await requireAdminSession()
  const allowed = ADMIN_CAPABILITIES[cap]
  if (!allowed || !allowed.includes(ctx.effectiveRole)) {
    throw new Error(`forbidden: capability ${cap}`)
  }
  return ctx
}
