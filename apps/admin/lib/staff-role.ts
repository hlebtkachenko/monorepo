import "server-only"

import { cache } from "react"
import { eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import {
  admin_staff_role,
  STAFF_ROLES,
  type StaffRole,
} from "@workspace/db/schema"

export type { StaffRole }

/**
 * Returns the user's admin staff role. Missing row → `"guest"` (minimal
 * access). Lookups go via `withAdminBypass` because `admin_staff_role` is
 * invisible to the app_user role.
 *
 * Wrapped in `React.cache` so nested layouts that each call `requireSection`
 * hit one DB query per request, not N.
 */
export const getStaffRole = cache(
  async (userId: string): Promise<StaffRole> => {
    const rows = await withAdminBypass((db) =>
      db
        .select({ role: admin_staff_role.role })
        .from(admin_staff_role)
        .where(eq(admin_staff_role.user_id, userId))
        .limit(1),
    )
    const raw = rows[0]?.role
    return isStaffRole(raw) ? raw : "guest"
  },
)

function isStaffRole(v: unknown): v is StaffRole {
  return typeof v === "string" && STAFF_ROLES.includes(v as StaffRole)
}
