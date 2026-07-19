/**
 * Valid access-token audiences the OAuth authorization server will mint tokens
 * for (`oauthProvider({ validAudiences })`).
 *
 * `@better-auth/oauth-provider` defaults `validAudiences` to `[baseURL]`. With
 * that default the AS REJECTS a client's RFC 8707 `resource=<mcp host>`
 * (`checkResource` throws `invalid_request`) and, when the client omits
 * `resource`, mints an OPAQUE token instead of a JWT
 * (`isJwtAccessToken = audience && !disableJwtPlugin`). Either path makes the API
 * verifier — which checks `aud === OAUTH_RESOURCE`
 * (`verifyOAuthAccessToken`) — fail closed, so OAuth on the hosted MCP endpoint
 * is dead on arrival. Advertising the hosted MCP resource here is what lets the
 * AS accept `resource=<mcp host>` and stamp a matching `aud` into the JWT.
 *
 * Returns `undefined` when `OAUTH_RESOURCE` is unset (dev / test), so the library
 * keeps its `[baseURL]` default and nothing else changes.
 */
export function resolveOAuthAudiences(
  resource: string | undefined,
): string[] | undefined {
  const trimmed = resource?.trim()
  return trimmed ? [trimmed] : undefined
}
