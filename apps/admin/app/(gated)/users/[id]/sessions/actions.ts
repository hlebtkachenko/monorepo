"use server"

import { revalidatePath } from "next/cache"
import { and, eq } from "drizzle-orm"
import { z } from "zod"

import { withAdminBypass } from "@workspace/db"
import { auth_session } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"

const RevokeUserSessionInput = z.object({
  session_id: z.string().uuid(),
  user_id: z.string().uuid(),
})

/**
 * Revoke a target user's session as a staff action. Defense-in-depth: the
 * SQL WHERE clause re-asserts the (session_id, user_id) ownership pairing so
 * a tampered session_id alone cannot delete a row belonging to a different
 * user.
 */
export async function revokeUserSession(rawInput: {
  session_id: string
  user_id: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdminCapability("admin:session.revoke")
    const input = RevokeUserSessionInput.parse(rawInput)

    const deleted = await withAdminBypass(async (db) => {
      const [row] = await db
        .select({ id: auth_session.id })
        .from(auth_session)
        .where(
          and(
            eq(auth_session.id, input.session_id),
            eq(auth_session.user_id, input.user_id),
          ),
        )
        .limit(1)

      if (!row) return false

      await db
        .delete(auth_session)
        .where(
          and(
            eq(auth_session.id, input.session_id),
            eq(auth_session.user_id, input.user_id),
          ),
        )

      return true
    })

    if (!deleted) {
      return { ok: false, error: "Session not found for this user" }
    }

    await auditAdminAction({
      action: "admin.user.session_revoked",
      payload: { session_id: input.session_id, user_id: input.user_id },
    })

    revalidatePath(`/users/${input.user_id}`)
    revalidatePath(`/users/${input.user_id}/sessions`)
    revalidatePath(`/users/${input.user_id}/timeline`)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
