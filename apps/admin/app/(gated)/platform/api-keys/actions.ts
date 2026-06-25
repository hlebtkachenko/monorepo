"use server"

import { revalidatePath } from "next/cache"
import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"

import { withAdminBypass } from "@workspace/db"
import { api_key } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"

const RevokeApiKeyInput = z.object({
  api_key_id: z.string().uuid(),
})

/**
 * Revoke an `api_key` row by setting `revoked_at = now()`. Defense-in-depth:
 * the SQL WHERE clause re-asserts `revoked_at IS NULL` so a double-fire (or
 * a tampered id pointing at an already-revoked row) is a no-op rather than
 * a silent rewrite of the revocation timestamp.
 */
export async function revokeApiKey(rawInput: {
  api_key_id: string
}): Promise<{ ok: boolean; error?: string }> {
  try {
    await requireAdminCapability("admin:api_key.revoke")
    const input = RevokeApiKeyInput.parse(rawInput)

    const revoked = await withAdminBypass(async (db) => {
      const result = await db
        .update(api_key)
        .set({ revoked_at: sql`now()`, updated_at: sql`now()` })
        .where(
          and(eq(api_key.id, input.api_key_id), isNull(api_key.revoked_at)),
        )
        .returning({ id: api_key.id })

      return result.length > 0
    })

    if (!revoked) {
      return { ok: false, error: "API key not found or already revoked" }
    }

    await auditAdminAction({
      action: "admin.dev.api_key_revoked",
      payload: { api_key_id: input.api_key_id },
    })

    revalidatePath("/platform/api-keys")
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
