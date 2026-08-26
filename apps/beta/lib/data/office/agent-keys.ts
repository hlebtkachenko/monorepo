import "server-only"

import { and, desc, eq, isNull, sql } from "drizzle-orm"

import { agent_key, app_user, organization } from "@/db/schema"
import { generateAgentKey, hashAgentKey } from "@/lib/agent/key"
import { isCheckViolation } from "@/lib/pg-error"

import { officeAgentKeyRow, type OfficeAgentKeyRow } from "../projections"
import type { OfficeScope } from "../scope"

import { officeDb } from "./db"

/**
 * Agentní klíče — the /admin registry of office agent keys (spec §3.2:
 * "issued/revoked in /admin, never held by clients").
 *
 * IT CANNOT SHOW A KEY, the same way `setup-links.ts` cannot show a link: the
 * table stores `sha256(secret)`, the secret exists once in the response to the
 * issue action, and `OfficeAgentKeyRow` has no field to put one in. A lost key
 * is REISSUED and the old one revoked — never recovered.
 *
 * A KEY ACTS AS ITS ISSUER. `acting_user_id` is the office user who pressed the
 * button, never a picked account, so the form cannot delegate one accountant's
 * authority to another and there is no "issue on behalf of" path to reason
 * about. The key can reach exactly the books its issuer can, it dies with their
 * account (trigger `app_user_disable_revokes_agent_keys`), and revoking it is
 * final (trigger `agent_key_freeze_identity`).
 */

const REGISTRY_LIMIT = 200

export async function listAgentKeys(
  office: OfficeScope,
): Promise<OfficeAgentKeyRow[]> {
  const rows = await officeDb(office)
    .select({
      id: agent_key.id,
      label: agent_key.label,
      organizationName: organization.legal_name,
      actingUserEmail: app_user.email,
      createdAt: agent_key.created_at,
      lastUsedAt: agent_key.last_used_at,
      revokedAt: agent_key.revoked_at,
    })
    .from(agent_key)
    .leftJoin(organization, eq(organization.id, agent_key.organization_id))
    .leftJoin(app_user, eq(app_user.id, agent_key.acting_user_id))
    .orderBy(desc(agent_key.created_at))
    .limit(REGISTRY_LIMIT)

  return rows.map(officeAgentKeyRow)
}

/**
 * THE ONLY TIME THE RAW SECRET EXISTS. It is returned to the action, travels to
 * one render, and is never persisted, logged or re-derivable.
 */
type IssuedAgentKey = {
  readonly id: string
  readonly secret: string
  readonly label: string
}

export type IssueAgentKeyResult =
  | { ok: true; key: IssuedAgentKey }
  | {
      ok: false
      reason: "invalid_label" | "organization_archived" | "rejected"
    }

export async function issueAgentKey(
  office: OfficeScope,
  input: { label: string; organizationId: string | null },
): Promise<IssueAgentKeyResult> {
  const label = input.label.trim()
  if (label.length === 0 || label.length > 120) {
    return { ok: false, reason: "invalid_label" }
  }

  const db = officeDb(office)

  // An archived book admits nobody (`resolveAgentOwnerScope` refuses it), so a
  // key scoped to one is a credential whose only possible answer is 404. Refused
  // here so the office is told why, rather than issuing a key that silently does
  // nothing.
  if (input.organizationId !== null) {
    const [book] = await db
      .select({ archivedAt: organization.archived_at })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1)
    if (book && book.archivedAt !== null) {
      return { ok: false, reason: "organization_archived" }
    }
  }

  const secret = generateAgentKey()

  try {
    const [row] = await db
      .insert(agent_key)
      .values({
        organization_id: input.organizationId,
        label,
        key_hash: hashAgentKey(secret),
        // The issuer, not a picked account — see the module header.
        acting_user_id: office.userId,
        created_by_user_id: office.userId,
      })
      .returning({ id: agent_key.id })

    if (!row) return { ok: false, reason: "rejected" }
    return { ok: true, key: { id: row.id, secret, label } }
  } catch (error) {
    // `agent_key_acting_user_is_staff` refusing is a legitimate no (the session
    // outlived the staff grant), not a fault to leak.
    if (isCheckViolation(error)) return { ok: false, reason: "rejected" }
    throw error
  }
}

/**
 * Revoke a live key.
 *
 * `revoked_at IS NULL` is in the WHERE clause rather than checked first:
 * revocation is write-once (trigger `agent_key_freeze_identity`), so re-revoking
 * would raise. Zero rows means "there was nothing live to revoke", which is also
 * the answer for an unknown id — the office user is looking at a list they just
 * read, so there is nothing to protect here, only a pointless error to avoid.
 */
export async function revokeAgentKey(
  office: OfficeScope,
  keyId: string,
): Promise<{ revoked: boolean }> {
  const updated = await officeDb(office)
    .update(agent_key)
    .set({ revoked_at: sql`now()`, revoked_by_user_id: office.userId })
    .where(and(eq(agent_key.id, keyId), isNull(agent_key.revoked_at)))
    .returning({ id: agent_key.id })

  return { revoked: updated.length > 0 }
}
