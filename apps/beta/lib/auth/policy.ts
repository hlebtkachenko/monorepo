/**
 * Beta's auth policy as data: cookie names, cookie attributes, session
 * lifetimes, rate-limit rules. Kept free of `better-auth` and of `server-only`
 * so the policy can be asserted directly in tests, and so a reviewer can read
 * the whole security posture in one screen.
 *
 * COOKIE POLICY — the two hard rules, and why they exist
 *
 * 1. `__Host-` prefix. The main product signs its session cookie for
 *    `Domain=.afframe.com` (crossSubDomainCookies, `packages/auth/src/server.ts`
 *    reading BETTER_AUTH_COOKIE_DOMAIN), and `beta.afframe.com` is under that
 *    apex — so a prod cookie physically arrives at beta on every request. A
 *    `__Secure-` cookie would also let any sibling host SET a domain-wide
 *    cookie of the same name; the browser then sends both and the server parses
 *    last-wins (cookie tossing → session fixation). `__Host-` is the browser-
 *    enforced answer: the UA refuses to store the cookie unless it is Secure,
 *    `Path=/`, and carries NO `Domain` attribute, which makes it host-only and
 *    un-tossable from a sibling.
 *
 * 2. A distinct cookie PREFIX (`beta-auth`, not Better Auth's default
 *    `better-auth`), set UNCONDITIONALLY — never behind an env check. Same
 *    reason: prod's cookie reaches this host, and a name collision would mean
 *    beta reads a prod session token. The two namespaces must not overlap in
 *    any environment, including a developer's localhost jar.
 *
 * Consequences worth knowing:
 *   - `getSessionCookie()` from `better-auth/cookies` cannot see this cookie: it
 *     looks for `<prefix>.session_token` and `__Secure-<prefix>.session_token`
 *     only (verified in better-auth 1.6.13, `dist/cookies/index.mjs:200-203`).
 *     That is a feature — beta has no middleware cookie peek at all; the portal
 *     gate is a server-side `getSession()` that hits the database. If a peek is
 *     ever added, it must match BETA_SESSION_COOKIE_NAME literally.
 *   - `Secure` is set unconditionally, so a plain-http dev server needs a
 *     browser that treats http://localhost as a secure context (Chrome and
 *     Firefox do; Safari does not store Secure cookies over http). Security
 *     posture does not get an env switch.
 */

/** Better Auth `advanced.cookiePrefix`. Never make this conditional. */
export const BETA_COOKIE_PREFIX = "beta-auth"

const hostCookie = (name: string) => `__Host-${BETA_COOKIE_PREFIX}.${name}`

/** The one cookie that carries the session. */
export const BETA_SESSION_COOKIE_NAME = hostCookie("session_token")

/**
 * Every cookie Better Auth's core can emit, renamed into the `__Host-`
 * namespace. `session_data` and `account_data` belong to the cookie cache,
 * which is disabled — they are listed so a future flip of that switch cannot
 * silently emit a differently-named, differently-scoped cookie.
 */
export const BETA_COOKIE_NAMES = {
  session_token: BETA_SESSION_COOKIE_NAME,
  session_data: hostCookie("session_data"),
  dont_remember: hostCookie("dont_remember"),
  account_data: hostCookie("account_data"),
} as const

/**
 * Attributes forced onto every auth cookie.
 *
 * `secure: true` is what makes the `__Host-` prefix legal. Better Auth derives
 * `secure` from its own `__Secure-` prefix logic, which we switch off (see
 * `useSecureCookies: false` in `server.ts`) so it does not prepend a second
 * prefix onto these names — these attributes are what put `Secure` back.
 */
export const BETA_COOKIE_ATTRIBUTES = {
  secure: true,
  httpOnly: true,
  sameSite: "lax",
  path: "/",
} as const

/**
 * Session policy. `cookieCache` stays DISABLED (see `server.ts`): every request
 * re-reads `auth_session`, so revoking a session takes effect on the next
 * request instead of up to `cookieCache.maxAge` later. Beta serves a handful of
 * users; the extra round-trip is not a cost worth trading revocation latency
 * for.
 */
export const BETA_SESSION_EXPIRES_IN_SECONDS = 60 * 60 * 24 * 7
export const BETA_SESSION_UPDATE_AGE_SECONDS = 60 * 60 * 24

/**
 * Rate limits on the Better Auth HTTP surface, keyed by client IP
 * (`cf-connecting-ip` — see `server.ts`).
 *
 * A custom rule REPLACES Better Auth's built-in special rule for that path
 * rather than stacking with it (1.6.13 `dist/api/rate-limiter/index.mjs`
 * :116-146), so `/sign-in/email` below has to be strictly tighter than the
 * built-in 3-per-10s burst rule it displaces when measured over a minute:
 * 5/minute vs the 18/minute that rule would allow.
 */
export const BETA_RATE_LIMIT_WINDOW_SECONDS = 60
export const BETA_RATE_LIMIT_MAX = 60
export const BETA_RATE_LIMIT_RULES = {
  "/sign-in/email": { window: 60, max: 5 },
  "/sign-out": { window: 60, max: 10 },
} as const

/**
 * Setup-link consume limit. The consume path is a Server Action, which never
 * touches Better Auth's HTTP router and therefore never touches its limiter —
 * this is the separate budget Advisor blocker B4-4 asks for ("own rate limiter
 * on consume route"). Tight on purpose: a legitimate visitor consumes one link
 * once, and the value being guessed is a 256-bit token.
 */
export const BETA_CONSUME_RATE_LIMIT = { window: 600, max: 10 } as const

/**
 * Setup-link GET limit (Advisor carry-in from the PR 06 gate).
 *
 * `peekSetupToken` runs on a GET, which is neither a Server Action nor a Better
 * Auth endpoint, so NEITHER of the two limiters above sees it. Without a budget
 * of its own the token-shaped URL space is the one unmetered oracle in the app:
 * a hit renders the invited address and the organization's legal name, a miss
 * renders the invalid-link card, and the difference is free to grind.
 *
 * Looser than the consume limit because a peek is idempotent and a real visitor
 * legitimately reloads the page; tight enough that guessing 256 bits stays the
 * absurdity it already is.
 */
export const BETA_PEEK_RATE_LIMIT = { window: 600, max: 30 } as const

/**
 * The floor under Better Auth's own limiter (Advisor carry-in from the PR 06
 * gate).
 *
 * Better Auth resolves its rate-limit key from the client IP and, when it
 * cannot determine one, SKIPS the limit entirely — verified in 1.6.13,
 * `dist/api/rate-limiter/index.mjs`: `resolveRateLimitConfig` logs a warning and
 * returns `null`, and both `onRequestRateLimit` and `onResponseRateLimit` return
 * early on a null config. Beta configures exactly one header
 * (`cf-connecting-ip`, `server.ts`), so any request that reaches the app without
 * it is unlimited — fail-OPEN on the sign-in endpoint.
 *
 * That should be unreachable (the Fargate task has no public ingress; every
 * request arrives through the tunnel and Cloudflare always sets the header) —
 * but "should be unreachable" is not a rate limit. This budget applies in
 * exactly the case Better Auth drops: no usable client IP. It is a SHARED
 * bucket per auth path, consistent with `rateLimitKey`'s shared-bucket
 * fallback, because with no IP there is nothing to key on and one shared bucket
 * is strictly safer than none.
 */
export const BETA_AUTH_NO_IP_RATE_LIMIT = { window: 60, max: 20 } as const

/**
 * Office issuance limit. /admin is staff-only and behind a session, so this is
 * not an anti-guessing budget: it is a blast-radius cap on a stolen office
 * session, which could otherwise mint invites into every organization at
 * machine speed.
 */
export const BETA_OFFICE_ISSUE_RATE_LIMIT = { window: 60, max: 20 } as const

/**
 * Agent ingestion budgets (spec §3.2), two of them, keyed on different things.
 *
 * PER IP, spent BEFORE the credential is hashed: it is the anti-guessing budget,
 * and it has to bite on requests that carry no valid key at all. Generous,
 * because the office agent and every other caller behind one NAT share it.
 *
 * PER KEY, spent after the key resolves: it is the blast-radius cap on a LEAKED
 * key — a credential that publishes 60 batches a minute is not doing a month-end
 * close. A month-end run is a handful of calls per organization, so this is two
 * orders of magnitude of headroom and still bounds what a stolen key can do
 * before the office revokes it in /admin.
 */
export const BETA_AGENT_IP_RATE_LIMIT = { window: 60, max: 240 } as const
export const BETA_AGENT_KEY_RATE_LIMIT = { window: 60, max: 60 } as const

/**
 * How stale `agent_key.last_used_at` may be. The column is a liveness signal for
 * the /admin registry, not an access log — writing it on every request would put
 * an UPDATE on the hot path of a bulk import for no reader's benefit.
 */
export const BETA_AGENT_LAST_USED_INTERVAL_MS = 60_000

/**
 * Setup-link lifetime. Plan Part 4 asks for 48-72h; the DB CHECK
 * `user_setup_token_ttl_max_72h` is the ceiling, this is the value actually
 * used. Not a caller parameter — see `issueSetupToken`.
 */
export const BETA_SETUP_LINK_TTL_HOURS = 48
