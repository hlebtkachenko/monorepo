"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { and, eq } from "drizzle-orm"

import { withAdminBypass } from "@workspace/db"
import { auth_session } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"

const RevokeOwnSessionInput = z.object({
  session_id: z.string().uuid(),
})

/**
 * Revoke one of the current staff user's own sessions.
 *
 * Better Auth's `auth.api.revokeUserSession` uses `adminMiddleware` which
 * requires live HTTP request headers — it cannot be called bare inside a
 * server action. We fall back to a direct DB delete via `withAdminBypass`,
 * which is safe because we first validate that the row belongs to the
 * current user before deleting.
 */
export async function revokeOwnSession(rawInput: {
  session_id: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const ctx = await requireAdminCapability("admin:read")
    const input = RevokeOwnSessionInput.parse(rawInput)

    const deleted = await withAdminBypass(async (db) => {
      const [row] = await db
        .select({ id: auth_session.id, user_id: auth_session.user_id })
        .from(auth_session)
        .where(
          and(
            eq(auth_session.id, input.session_id),
            eq(auth_session.user_id, ctx.userId),
          ),
        )
        .limit(1)

      if (!row) return false

      await db
        .delete(auth_session)
        .where(
          and(
            eq(auth_session.id, input.session_id),
            eq(auth_session.user_id, ctx.userId),
          ),
        )

      return true
    })

    if (!deleted) {
      return { ok: false, error: "Session not found or does not belong to you" }
    }

    await auditAdminAction({
      action: "admin.me.session_revoked",
      payload: { session_id: input.session_id },
    })

    revalidatePath("/profile")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
