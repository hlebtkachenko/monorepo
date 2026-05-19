/**
 * Kind-aware cookie helpers for auth_token (ADR-0022).
 *
 * Carries the raw `afkey-...` string in an HttpOnly cookie. The hash lives
 * in the DB; the cookie is just transport between mint and consume.
 *
 * Framework-neutral. Consumers pass any cookie store matching the
 * `CookieStore` interface — `next/headers`' `cookies()` return value in
 * the web/admin apps, the supertest cookie jar in tests, etc. Keeping the
 * function signature jar-agnostic means `@workspace/auth/tokens` never
 * depends on `next/headers`, so the api app (NestJS) can still import
 * `mintToken` / `consumeToken` from this barrel.
 *
 * Cookie inventory per ADR-0022 §"Kind taxonomy":
 *
 *   sig: __Host-afkey-sig   path=/             48h   __Host- prefix
 *   inv: __Host-afkey-inv   path=/             72h   __Host- prefix
 *   lem: afkey-lem          path=/auth/login   10min (path-scoped, so no __Host-)
 *   ons: __Host-afkey-ons   path=/             24h   __Host- prefix
 *   wks: __Host-afkey-wks   path=/             90d   __Host- prefix
 *
 * The __Host- prefix forces Path=/ at the browser, so the `lem` cookie
 * accepts the slightly weaker posture in exchange for /auth/login path
 * scoping. Its 10-minute TTL bounds the exposure.
 */

import type { AuthTokenKind } from "@workspace/db/schema"

import { DEFAULT_TTL_SECONDS } from "./auth-token"

export interface AuthCookieDescriptor {
  /** Final cookie name as the browser sees it (already includes __Host- where applicable). */
  readonly name: string
  /** Path attribute. __Host- prefix requires "/". */
  readonly path: string
  /** Whether the name carries the __Host- prefix (informational). */
  readonly hostPrefix: boolean
  /** Default TTL in seconds. Caller may override per call. */
  readonly defaultTtlSeconds: number
}

export const AUTH_COOKIE_DESCRIPTORS: Record<
  AuthTokenKind,
  AuthCookieDescriptor
> = {
  sig: {
    name: "__Host-afkey-sig",
    path: "/",
    hostPrefix: true,
    defaultTtlSeconds: DEFAULT_TTL_SECONDS.sig,
  },
  inv: {
    name: "__Host-afkey-inv",
    path: "/",
    hostPrefix: true,
    defaultTtlSeconds: DEFAULT_TTL_SECONDS.inv,
  },
  lem: {
    name: "afkey-lem",
    path: "/auth/login",
    hostPrefix: false,
    defaultTtlSeconds: DEFAULT_TTL_SECONDS.lem,
  },
  ons: {
    name: "__Host-afkey-ons",
    path: "/",
    hostPrefix: true,
    defaultTtlSeconds: DEFAULT_TTL_SECONDS.ons,
  },
  wks: {
    name: "__Host-afkey-wks",
    path: "/",
    hostPrefix: true,
    defaultTtlSeconds: DEFAULT_TTL_SECONDS.wks,
  },
}

/**
 * Minimal cookie-jar contract. Matches the App Router cookies() shape
 * (set/get/delete) plus the supertest cookie jar shape, without dragging
 * either type into the auth package.
 */
export interface CookieStore {
  get(name: string): { name: string; value: string } | undefined
  set(opts: {
    name: string
    value: string
    path?: string
    httpOnly?: boolean
    secure?: boolean
    sameSite?: "lax" | "strict" | "none" | boolean
    maxAge?: number
  }): void
  delete(opts: { name: string; path?: string }): void
}

export interface SetAuthCookieOptions {
  /**
   * Override the default TTL for this kind. Used by `ons` sliding renewal
   * (ADR-0022 §"Kind taxonomy") and the rare admin "extend" path.
   */
  ttlSecondsOverride?: number
  /**
   * Force the `Secure` attribute off for local non-HTTPS dev. Defaults to
   * `true` everywhere else, which is required by the __Host- prefix.
   */
  insecureLocalDev?: boolean
}

/**
 * Write the cookie for `kind` carrying `rawToken`. Caller already
 * has the raw token from `mintToken(...)`.
 */
export function setAuthCookie(
  store: CookieStore,
  kind: AuthTokenKind,
  rawToken: string,
  options: SetAuthCookieOptions = {},
): void {
  const desc = AUTH_COOKIE_DESCRIPTORS[kind]
  const secure = options.insecureLocalDev === true ? false : true
  if (desc.hostPrefix && !secure) {
    throw new Error(
      `setAuthCookie: cookie "${desc.name}" requires Secure (the __Host- prefix is browser-enforced). Refusing to write a non-Secure cookie.`,
    )
  }
  const maxAge = options.ttlSecondsOverride ?? desc.defaultTtlSeconds
  if (!Number.isFinite(maxAge) || maxAge <= 0) {
    throw new Error(
      `setAuthCookie: invalid maxAge for kind=${kind} (${maxAge})`,
    )
  }
  store.set({
    name: desc.name,
    value: rawToken,
    path: desc.path,
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge,
  })
}

/** Read the raw cookie value for `kind`, or null if absent. */
export function readAuthCookie(
  store: CookieStore,
  kind: AuthTokenKind,
): string | null {
  const desc = AUTH_COOKIE_DESCRIPTORS[kind]
  return store.get(desc.name)?.value ?? null
}

/**
 * Delete the cookie for `kind`. Always pass the path because some
 * cookie-jar implementations (supertest) require it to match for delete
 * to land.
 */
export function clearAuthCookie(store: CookieStore, kind: AuthTokenKind): void {
  const desc = AUTH_COOKIE_DESCRIPTORS[kind]
  store.delete({ name: desc.name, path: desc.path })
}
