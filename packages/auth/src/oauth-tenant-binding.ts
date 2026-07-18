import { and, eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import {
  oauth_pending_reference,
  organization_membership,
} from "@workspace/db/schema"

/**
 * OAuth 2.1 tenant binding.
 *
 * Every OAuth access token this authorization server issues is bound to exactly
 * ONE organization, mirroring the api_key = one-org rule (see
 * api-key-verifier.ts). The org is chosen at authorize time and lands in the
 * token as a namespaced claim; the API re-derives the workspace and re-validates
 * the membership on every call, so a forged or stale binding is never trusted.
 *
 * These helpers back the `oauthProvider` plugin's `postLogin` +
 * `customAccessTokenClaims` callbacks in server.ts. They run inside the Better
 * Auth authorize flow (no tenant GUC set), so membership is read cross-org via
 * `withAdminBypass` — the same pattern the api-key verifier uses.
 */

/**
 * Namespaced access-token claim carrying the single organization a token is
 * bound to. URI-namespaced to stay OIDC-compliant (a bare `organization_id`
 * claim could collide with a client's own claims).
 */
export const OAUTH_ORGANIZATION_CLAIM = "https://afframe.com/organization_id"

export type TokenOrganizationResult =
  | { readonly ok: true; readonly organizationId: string }
  | {
      readonly ok: false
      readonly reason: "no_organization" | "select_organization"
    }

/**
 * Pure decision: given a user's active org memberships and their pending choice,
 * resolve the one organization to bind the token to. Fail-closed and total:
 * - 0 active orgs   -> `no_organization` (cannot mint an org-bound token).
 * - exactly 1       -> bind to it (no selection step needed).
 * - more than 1     -> require a pending choice that is STILL a live active
 *                      membership; a missing/stale/forged choice -> re-select.
 *
 * Kept pure (no DB) so every branch of the security-critical logic is unit
 * tested without standing up a database.
 */
export function decideTokenOrganization(
  activeOrganizationIds: readonly string[],
  pendingOrganizationId: string | null,
): TokenOrganizationResult {
  if (activeOrganizationIds.length === 0) {
    return { ok: false, reason: "no_organization" }
  }
  if (activeOrganizationIds.length === 1) {
    return { ok: true, organizationId: activeOrganizationIds[0]! }
  }
  if (
    pendingOrganizationId &&
    activeOrganizationIds.includes(pendingOrganizationId)
  ) {
    return { ok: true, organizationId: pendingOrganizationId }
  }
  return { ok: false, reason: "select_organization" }
}

async function listActiveOrganizationIds(userId: string): Promise<string[]> {
  return withAdminBypass(async (db) => {
    const rows = await db
      .select({ organizationId: organization_membership.organization_id })
      .from(organization_membership)
      .where(
        and(
          eq(organization_membership.user_id, userId),
          eq(organization_membership.active, true),
        ),
      )
    return rows.map((r) => r.organizationId)
  })
}

async function readPendingReference(userId: string): Promise<string | null> {
  return withAdminBypass(async (db) => {
    const rows = await db
      .select({ organizationId: oauth_pending_reference.organization_id })
      .from(oauth_pending_reference)
      .where(eq(oauth_pending_reference.user_id, userId))
      .limit(1)
    return rows[0]?.organizationId ?? null
  })
}

/** Resolve the single organization an OAuth token must bind to for `userId`. */
export async function resolveTokenOrganization(
  userId: string,
): Promise<TokenOrganizationResult> {
  const [active, pending] = await Promise.all([
    listActiveOrganizationIds(userId),
    readPendingReference(userId),
  ])
  return decideTokenOrganization(active, pending)
}

/**
 * True iff `organizationId` is a live active membership of `userId`. The final
 * defense re-check in `customAccessTokenClaims`: the reference_id is only
 * stamped into a token if it still maps to a real active membership.
 */
export async function isActiveMember(
  userId: string,
  organizationId: string,
): Promise<boolean> {
  return withAdminBypass(async (db) => {
    const rows = await db
      .select({ id: organization_membership.id })
      .from(organization_membership)
      .where(
        and(
          eq(organization_membership.user_id, userId),
          eq(organization_membership.organization_id, organizationId),
          eq(organization_membership.active, true),
        ),
      )
      .limit(1)
    return rows.length > 0
  })
}
