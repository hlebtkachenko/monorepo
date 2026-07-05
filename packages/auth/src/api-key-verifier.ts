import { eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { api_key } from "@workspace/db/schema"

import { API_KEY_PREFIX, hashApiKey } from "./tokens/api-key"

/**
 * Caller identity resolved from an API key. Organization-scoped: an API key
 * is always bound to exactly one organization (and its parent workspace).
 *
 * The api's ApiKeyGuard resolves this before any controller runs; the
 * controller passes `organizationId` straight into `withOrganization`.
 */
export interface ApiKeyPrincipal {
  /** app_user.id of the key's creator. Null when the key has no creating user. */
  readonly userId: string | null
  readonly organizationId: string
  readonly workspaceId: string
  /** Coarse capability scopes carried by the key (api_key.scopes). */
  readonly scopes: readonly string[]
  /**
   * Actor capability of the key ([#517]). `human` = a person acting through the
   * API (may resolve held writes); `agent` = an autonomous Brain client (may
   * propose gated writes, but is DENIED on the held-write resolve endpoint
   * server-side). Narrowed fail-safe from `api_key.actor_kind`: any value other
   * than the exact `human` resolves to `agent` (the less-privileged kind).
   */
  readonly actorKind: "human" | "agent"
}

/**
 * Resolve a raw API key into an {@link ApiKeyPrincipal}, or `null` if the key
 * is unknown, revoked, or expired.
 *
 * Lookup is by `sha256(rawKey)` across all organizations, so it runs under
 * `withAdminBypass` — the same cross-organization pattern the invite-consume
 * path uses (see invite-issuer.ts). `last_used_at` is then touched in a
 * separate, best-effort transaction: it is a non-critical audit timestamp,
 * so a transient write failure must never reject an otherwise-valid key.
 *
 * This function is the single seam for API-key verification. Swapping the
 * local table for an external provider (Unkey) later changes only this body.
 */
export async function verifyApiKey(
  rawKey: string,
): Promise<ApiKeyPrincipal | null> {
  if (!rawKey.startsWith(API_KEY_PREFIX)) return null
  const keyHash = hashApiKey(rawKey)

  const match = await withAdminBypass(async (db) => {
    const rows = await db
      .select({
        id: api_key.id,
        organizationId: api_key.organization_id,
        workspaceId: api_key.workspace_id,
        createdByUserId: api_key.created_by_user_id,
        scopes: api_key.scopes,
        actorKind: api_key.actor_kind,
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
    return row
  })

  if (!match) return null

  // Best-effort: a failed `last_used_at` write must not fail a valid key.
  // Runs in its own transaction so a failure here cannot abort the lookup.
  try {
    await withAdminBypass((db) =>
      db
        .update(api_key)
        .set({ last_used_at: new Date() })
        .where(eq(api_key.id, match.id)),
    )
  } catch {
    // Swallowed by design — `last_used_at` is a non-critical audit field.
  }

  return {
    userId: match.createdByUserId,
    organizationId: match.organizationId,
    workspaceId: match.workspaceId,
    scopes: match.scopes,
    // Fail-safe narrowing: only the exact `human` grants the human capability;
    // any other value (incl. an unexpected one) resolves to `agent`, the
    // less-privileged kind that is denied held-write resolve.
    actorKind: match.actorKind === "human" ? "human" : "agent",
  }
}
