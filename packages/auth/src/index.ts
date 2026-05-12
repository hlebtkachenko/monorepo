/**
 * Public `@workspace/auth` entry points.
 *
 * Server: `@workspace/auth/server` — the Better Auth instance (Node only)
 * Client: `@workspace/auth/client` — React hooks + `signIn`, `signOut` (browser)
 * Tokens: `@workspace/auth/tokens` — signup + invite JWT sign/verify
 *
 * The bare import `@workspace/auth` re-exports tokens only, since they are
 * the cross-cutting primitive both server actions and route handlers reach
 * for. Server and client live behind explicit subpaths to keep their
 * runtime requirements separate.
 */
export * from "./tokens/index"
