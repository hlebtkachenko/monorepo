import { and, eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import {
  oauth_client,
  oauth_pending_reference,
  organization,
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

/**
 * Resolve the tenant context for an active membership, or null if the user is
 * not a live active member of the organization. Used by the OAuth token
 * verifier at API-call time: it both re-validates membership (so a revoked
 * membership invalidates the token immediately, not only at refresh) AND
 * resolves the workspace the org belongs to for the principal.
 */
export async function resolveActiveMembershipContext(
  userId: string,
  organizationId: string,
): Promise<{ workspaceId: string } | null> {
  return withAdminBypass(async (db) => {
    const rows = await db
      .select({ workspaceId: organization_membership.workspace_id })
      .from(organization_membership)
      .where(
        and(
          eq(organization_membership.user_id, userId),
          eq(organization_membership.organization_id, organizationId),
          eq(organization_membership.active, true),
        ),
      )
      .limit(1)
    const row = rows[0]
    return row ? { workspaceId: row.workspaceId } : null
  })
}

export interface ActiveOrganizationOption {
  readonly id: string
  readonly legalName: string
  readonly slug: string
}

/**
 * The user's active organizations (id + display name + slug) for the
 * `/auth/select-organization` picker. Cross-org read via `withAdminBypass`
 * (the authorize flow has no tenant GUC set).
 */
export async function listActiveOrganizationsForUser(
  userId: string,
): Promise<ActiveOrganizationOption[]> {
  return withAdminBypass(async (db) => {
    return db
      .select({
        id: organization.id,
        legalName: organization.legal_name,
        slug: organization.slug,
      })
      .from(organization_membership)
      .innerJoin(
        organization,
        eq(organization_membership.organization_id, organization.id),
      )
      .where(
        and(
          eq(organization_membership.user_id, userId),
          eq(organization_membership.active, true),
        ),
      )
  })
}

/**
 * Persist the organization the user chose on `/auth/select-organization`, so
 * `postLogin.consentReferenceId` reads it back. Upsert (one row per user,
 * last-choice-wins). The caller MUST have verified the choice is a live active
 * membership (`isActiveMember`) first; `consentReferenceId` re-validates it
 * regardless, so a stale row can never bind a token to a non-member org.
 */
export async function writePendingReference(
  userId: string,
  organizationId: string,
): Promise<void> {
  await withAdminBypass(async (db) => {
    await db
      .insert(oauth_pending_reference)
      .values({ user_id: userId, organization_id: organizationId })
      .onConflictDoUpdate({
        target: oauth_pending_reference.user_id,
        set: { organization_id: organizationId, updated_at: new Date() },
      })
  })
}

/**
 * Display info for an OAuth client, for the consent screen. Returns null for an
 * unknown client_id (the consent page then falls back to showing the id).
 */
export async function findOAuthClientDisplay(
  clientId: string,
): Promise<{ name: string | null; uri: string | null } | null> {
  return withAdminBypass(async (db) => {
    const rows = await db
      .select({ name: oauth_client.name, uri: oauth_client.uri })
      .from(oauth_client)
      .where(eq(oauth_client.clientId, clientId))
      .limit(1)
    return rows[0] ?? null
  })
}
