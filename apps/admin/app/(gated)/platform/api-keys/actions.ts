"use server"

import { revalidatePath } from "next/cache"
import { and, desc, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"

import { generateRawApiKey } from "@workspace/auth/tokens"
import { withAdminBypass } from "@workspace/db"
import { api_key, organization } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"
import { requireStepUpForAction } from "@/lib/step-up"

const RevokeApiKeyInput = z.object({
  api_key_id: z.string().uuid(),
})

const IssueBrainAgentKeyInput = z.object({
  name: z.string().trim().min(1).max(200),
  organizationId: z.string().uuid(),
  scopes: z.array(z.string().min(1)).min(1).default(["accounting:write"]),
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

export interface IssueBrainAgentKeyResult {
  ok: boolean
  id?: string
  /** The raw secret — shown to the operator exactly once, never stored. */
  raw?: string
  error?: string
}

/**
 * Mint an `actor_kind='agent'` API key for the Afframe Brain client.
 *
 * `actor_kind` is HARDCODED to `"agent"` here — never defaulted. The DB column
 * defaults to `'human'` (migration 0045), and a human-actor key would pass the
 * `@RequireHumanActor` guard, turning the Brain into a live self-approval lane on
 * the held-write review surface (held-write RESOLVE is admission-exempt). This is
 * the single load-bearing invariant of this action; the value must not leak to
 * the column default.
 *
 * `workspace_id` is resolved from the target organization's immutable
 * `workspace_id` (organization.workspace_id, set at scaffold time) — the key is
 * bound to the org's own workspace, never taken from request input.
 *
 * The raw key is returned once and never persisted (only its sha256 `key_hash`
 * lands in the row). The audit payload logs the id, name, and actor_kind ONLY —
 * never the raw key or its hash.
 */
export async function issueBrainAgentKey(rawInput: {
  name: string
  organizationId: string
  scopes?: string[]
}): Promise<IssueBrainAgentKeyResult> {
  // Cap + step-up BEFORE the try: requireStepUpForAction throws NEXT_REDIRECT,
  // which must escape uncaught so the client navigates to /auth/step-up. If it
  // were inside the try it would be swallowed into the error result and the gate
  // would silently fail. Minting a write-capable agent key earns a fresh re-auth.
  const ctx = await requireAdminCapability("admin:api_key.create")
  await requireStepUpForAction("api_key.create", "/platform/api-keys")
  try {
    const input = IssueBrainAgentKeyInput.parse(rawInput)
    const { raw, keyHash, prefix } = generateRawApiKey()

    const inserted = await withAdminBypass(async (db) => {
      const orgRows = await db
        .select({ workspace_id: organization.workspace_id })
        .from(organization)
        .where(eq(organization.id, input.organizationId))
        .limit(1)
      const workspaceId = orgRows[0]?.workspace_id
      if (!workspaceId) return null

      const result = await db
        .insert(api_key)
        .values({
          organization_id: input.organizationId,
          workspace_id: workspaceId,
          name: input.name,
          prefix,
          key_hash: keyHash,
          scopes: input.scopes,
          actor_kind: "agent", // HARDCODED — never the column's 'human' default.
          created_by_user_id: ctx.userId,
        })
        .returning({ id: api_key.id })

      return result[0] ?? null
    })

    if (!inserted) {
      return { ok: false, error: "Organization not found" }
    }

    await auditAdminAction({
      action: "admin.dev.api_key_created",
      organizationId: input.organizationId,
      payload: {
        api_key_id: inserted.id,
        name: input.name,
        actor_kind: "agent",
      },
    })

    revalidatePath("/platform/api-keys")
    return { ok: true, id: inserted.id, raw }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export interface ApiKeyOrgChoice {
  id: string
  slug: string
  legalName: string
}

/**
 * Org picker for the "Issue Brain agent key" dialog. Gated on the same
 * create capability that mints the key (not the broader admin:read).
 */
export async function listOrganizationsForKeyAction(): Promise<
  ApiKeyOrgChoice[]
> {
  await requireAdminCapability("admin:api_key.create")
  try {
    return await withAdminBypass(async (db) => {
      const rows = await db
        .select({
          id: organization.id,
          slug: organization.slug,
          legalName: organization.legal_name,
        })
        .from(organization)
        .orderBy(desc(organization.created_at))
        .limit(20)
      return rows
    })
  } catch {
    return []
  }
}
