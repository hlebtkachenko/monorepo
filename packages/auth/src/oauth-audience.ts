/**
 * Accepted OAuth access-token audiences (RFC 8707 resource indicators) for a
 * configured resource, shared by the authorization server
 * (`oauthProvider({ validAudiences })`) and the API's token verifier.
 *
 * `@better-auth/oauth-provider` compares the client's `resource` byte-for-byte
 * (a `Set.has`), then stamps that exact string into the JWT `aud`. But MCP
 * clients derive `resource` from the REGISTERED SERVER URL, not our canonical
 * no-slash identifier: Claude Code adds `https://mcp.afframe.com/` and so sends
 * `resource=https://mcp.afframe.com/` (trailing slash), while `OAUTH_RESOURCE`
 * is `https://mcp.afframe.com`. A byte-exact check then throws
 * `requested resource invalid` and the flow dies at token exchange (verified
 * from Claude Code's own OAuth log). Accepting BOTH slash spellings at both
 * enforcement points — advertise both in `validAudiences`, and verify the token
 * `aud` against both — tolerates the trailing slash without weakening the
 * binding: the accepted set is still exactly one host, in its two spellings.
 */
export function oauthAudienceVariants(resource: string): string[] {
  const bare = resource.replace(/\/+$/, "")
  return [bare, `${bare}/`]
}

/**
 * `validAudiences` for the authorization server, or `undefined` when
 * `OAUTH_RESOURCE` is unset (dev / test) so the library keeps its `[baseURL]`
 * default and nothing else changes.
 */
export function resolveOAuthAudiences(
  resource: string | undefined,
): string[] | undefined {
  const trimmed = resource?.trim()
  return trimmed ? oauthAudienceVariants(trimmed) : undefined
}
