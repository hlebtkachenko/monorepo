import "server-only"

import { aliasedTable, and, desc, eq, isNull, sql } from "drizzle-orm"

import { app_user, organization, user_setup_token } from "@/db/schema"

import { officeSetupLinkRow, type OfficeSetupLinkRow } from "../projections"
import type { OfficeScope } from "../scope"

import { officeDb } from "./db"

/**
 * Setup-linky — the /admin registry of one-time links (spec §3.5).
 *
 * WHAT THE REGISTRY CANNOT DO, BY CONSTRUCTION: show a link. The table stores
 * `sha256(secret)` and never the secret, so there is no query that reconstructs
 * a usable URL, and `officeSetupLinkRow` has no field to put one in. A link is
 * displayed exactly once — in the response to the action that minted it — and a
 * lost link is re-ISSUED, never re-read. That is the property this whole
 * design exists for, and it is why "just cache the raw token so the office can
 * copy it again" is not a small convenience.
 *
 * The registry answers the questions that remain useful: who was invited into
 * what, as what role, is the link still live, and who issued it.
 */

/** The issuer, joined separately from the invitee (both are `app_user`). */
const issuer = aliasedTable(app_user, "issuer")

const LINK_COLUMNS = {
  id: user_setup_token.id,
  purpose: user_setup_token.purpose,
  email: user_setup_token.email,
  organizationName: organization.legal_name,
  grantedRole: user_setup_token.granted_role,
  consumedAt: user_setup_token.consumed_at,
  revokedAt: user_setup_token.revoked_at,
  expiresAt: user_setup_token.expires_at,
  createdAt: user_setup_token.created_at,
  issuedByEmail: issuer.email,
}

/**
 * Newest first, capped. The office cares about what is outstanding right now;
 * the tail is history and would grow without bound. A dedicated audit view can
 * page through it later if anyone ever needs to.
 */
const REGISTRY_LIMIT = 200

export async function listSetupLinks(
  office: OfficeScope,
  filter: { organizationId?: string } = {},
): Promise<OfficeSetupLinkRow[]> {
  const db = officeDb(office)

  const rows = await db
    .select(LINK_COLUMNS)
    .from(user_setup_token)
    .leftJoin(
      organization,
      eq(organization.id, user_setup_token.organization_id),
    )
    .leftJoin(issuer, eq(issuer.id, user_setup_token.issued_by_user_id))
    .where(
      filter.organizationId
        ? eq(user_setup_token.organization_id, filter.organizationId)
        : undefined,
    )
    .orderBy(desc(user_setup_token.created_at))
    .limit(REGISTRY_LIMIT)

  const now = new Date()
  return rows.map((row) => officeSetupLinkRow(row, now))
}

/**
 * Revoke a link that has not been used.
 *
 * `consumed_at IS NULL AND revoked_at IS NULL` is in the WHERE clause rather
 * than checked first: `revoked_at` is write-once (migration 0001), so revoking
 * an already-revoked row would raise, and revoking a CONSUMED one is a
 * meaningless act the UI should not be able to perform. Zero rows updated means
 * "there was nothing live to revoke", which is the same answer for an unknown
 * id — the office user is looking at a list they just read, so there is no
 * information to protect here, only a pointless error to avoid.
 */
export async function revokeSetupLink(
  office: OfficeScope,
  tokenId: string,
): Promise<{ revoked: boolean }> {
  const updated = await officeDb(office)
    .update(user_setup_token)
    .set({ revoked_at: sql`now()` })
    .where(
      and(
        eq(user_setup_token.id, tokenId),
        isNull(user_setup_token.consumed_at),
        isNull(user_setup_token.revoked_at),
      ),
    )
    .returning({ id: user_setup_token.id })

  return { revoked: updated.length > 0 }
}
