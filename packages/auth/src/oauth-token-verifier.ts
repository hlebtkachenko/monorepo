import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose"

import type { ApiKeyPrincipal } from "./api-key-verifier"
import {
  OAUTH_ORGANIZATION_CLAIM,
  resolveActiveMembershipContext,
} from "./oauth-tenant-binding"

/**
 * OAuth 2.1 access-token verification for the public API.
 *
 * A caller may authenticate `/v1/*` with either an Afframe API key (`affk_` /
 * legacy `afk_`, handled by {@link verifyApiKey}) or an OAuth 2.1 access token
 * (a JWT issued by our authorization server, verified here). Both resolve to the
 * SAME {@link ApiKeyPrincipal} shape so the controllers and RLS scoping are
 * identical regardless of credential type.
 *
 * The token is verified against the authorization server's JWKS (asymmetric
 * signature), issuer, and audience, then mapped to a principal. Tenant binding
 * mirrors an API key: the token carries exactly one organization in a namespaced
 * claim, which is RE-VALIDATED as a live active membership at call time (so a
 * revoked membership invalidates the token immediately) and used to resolve the
 * workspace. `actorKind` is always `agent`, so OAuth callers are denied the
 * human-only surfaces (@RequireHumanActor, e.g. the held-write review) exactly
 * like a Brain agent key.
 *
 * Fail-closed everywhere: unconfigured env, a bad signature/issuer/audience, a
 * missing subject, a missing organization claim, EMPTY scopes, or a
 * non-member org all return `null` (rejected). In particular an OAuth token must
 * carry explicit scopes — an empty scope set is rejected, never mapped to the
 * legacy "empty scopes = full access" API-key allowance.
 */

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>()

function getJwks(uri: string): ReturnType<typeof createRemoteJWKSet> {
  let set = jwksCache.get(uri)
  if (!set) {
    set = createRemoteJWKSet(new URL(uri))
    jwksCache.set(uri, set)
  }
  return set
}

/** Space-delimited string OR string[] `scope` claim → a clean scope list. */
export function parseScopeClaim(scope: unknown): string[] {
  if (typeof scope === "string") {
    return scope.split(/\s+/).filter(Boolean)
  }
  if (Array.isArray(scope)) {
    return scope.filter(
      (s): s is string => typeof s === "string" && s.length > 0,
    )
  }
  return []
}

export type OAuthPrincipalDraft =
  | {
      readonly ok: true
      readonly userId: string
      readonly organizationId: string
      readonly scopes: string[]
    }
  | {
      readonly ok: false
      readonly reason:
        "missing_subject" | "missing_organization" | "empty_scopes"
    }

/**
 * Pure mapping from a verified JWT payload to the principal inputs, applying the
 * fail-closed rules. Kept free of jose/DB so every rejection branch is unit
 * tested. The signature/issuer/audience checks happen in
 * {@link verifyOAuthAccessToken} before this runs.
 */
export function draftPrincipalFromClaims(
  payload: JWTPayload,
): OAuthPrincipalDraft {
  const sub = payload.sub
  if (typeof sub !== "string" || sub.length === 0) {
    return { ok: false, reason: "missing_subject" }
  }
  const orgClaim = payload[OAUTH_ORGANIZATION_CLAIM]
  if (typeof orgClaim !== "string" || orgClaim.length === 0) {
    return { ok: false, reason: "missing_organization" }
  }
  const scopes = parseScopeClaim(payload.scope)
  if (scopes.length === 0) {
    // OAuth tokens MUST carry explicit scopes — never fall through to the
    // api-key "empty scopes = legacy full access" allowance (ApiKeyGuard).
    return { ok: false, reason: "empty_scopes" }
  }
  return { ok: true, userId: sub, organizationId: orgClaim, scopes }
}

/**
 * Verify an OAuth 2.1 access-token JWT and resolve it to an
 * {@link ApiKeyPrincipal}, or `null` if it is unconfigured, invalid, or no
 * longer maps to a live active membership.
 */
export async function verifyOAuthAccessToken(
  token: string,
): Promise<ApiKeyPrincipal | null> {
  const issuer = process.env.OAUTH_ISSUER?.trim()
  const jwksUri = process.env.OAUTH_JWKS_URI?.trim()
  const audience = process.env.OAUTH_RESOURCE?.trim()
  // Fail closed if the OAuth verifier is not configured for this environment.
  if (!issuer || !jwksUri || !audience) return null

  let payload: JWTPayload
  try {
    const verified = await jwtVerify(token, getJwks(jwksUri), {
      issuer,
      audience,
    })
    payload = verified.payload
  } catch {
    // Bad signature, wrong issuer/audience, expired, malformed — all rejected.
    return null
  }

  const draft = draftPrincipalFromClaims(payload)
  if (!draft.ok) return null

  const context = await resolveActiveMembershipContext(
    draft.userId,
    draft.organizationId,
  )
  if (!context) return null

  return {
    userId: draft.userId,
    organizationId: draft.organizationId,
    workspaceId: context.workspaceId,
    scopes: draft.scopes,
    // OAuth callers are agents: denied the human-only surfaces server-side.
    actorKind: "agent",
  }
}
