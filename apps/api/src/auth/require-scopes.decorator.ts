import { SetMetadata } from "@nestjs/common"

/** Reflector metadata key carrying a route's required API-key scopes. */
export const REQUIRED_SCOPES_KEY = "required_api_key_scopes"

/**
 * Declares the API-key scopes a route requires. Enforced by `ApiKeyGuard`
 * after the key resolves: the key must carry EVERY listed scope in
 * `api_key.scopes`, else the request is rejected with 403 naming the missing
 * scope(s). Routes without this decorator are unaffected.
 *
 * Back-compat rule (deliberate): a key whose `scopes` array is EMPTY is a
 * legacy full-access key and is allowed through with a logged warning. Scope
 * enforcement goes strict (empty = deny) once all issued keys carry explicit
 * scopes.
 */
export const RequireScopes = (...scopes: string[]) =>
  SetMetadata(REQUIRED_SCOPES_KEY, scopes)
