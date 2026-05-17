import { eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { api_key } from "@workspace/db/schema"
import { API_KEY_PREFIX, hashApiKey } from "@workspace/auth/tokens"
import type { OrgPrincipal } from "../principal"

/**
 * Resolve a raw API key into an {@link OrgPrincipal}, or `null` if the key is
 * unknown, revoked, or expired.
 *
 * Lookup is by `sha256(rawKey)` across all organizations, so it runs under
 * `withAdminBypass` — the same cross-organization pattern the invite-consume
 * path uses (see tenancy.ts). `last_used_at` is touched best-effort inside the
 * same transaction.
 *
 * This function is the single seam for API-key verification. Swapping the
 * local table for an external provider (Unkey) later changes only this body.
 */
export async function verifyApiKey(
  rawKey: string,
): Promise<OrgPrincipal | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null
  const keyHash = hashApiKey(rawKey)

  return await withAdminBypass(async (db) => {
    const rows = await db
      .select({
        id: api_key.id,
        organizationId: api_key.organization_id,
        workspaceId: api_key.workspace_id,
        createdByUserId: api_key.created_by_user_id,
        scopes: api_key.scopes,
        expiresAt: api_key.expires_at,
        revokedAt: api_key.revoked_at,
      })
      .from(api_key)
      .where(eq(api_key.key_hash, keyHash))
      .limit(1)

    const row = rows[0]
    if (!row) return null
    if (row.revokedAt !== null) return null
    if (row.expiresAt !== null && row.expiresAt.getTime() <= Date.now()) {
      return null
    }

    await db
      .update(api_key)
      .set({ last_used_at: new Date() })
      .where(eq(api_key.id, row.id))

    return {
      userId: row.createdByUserId,
      organizationId: row.organizationId,
      workspaceId: row.workspaceId,
      scopes: row.scopes,
    }
  })
}
