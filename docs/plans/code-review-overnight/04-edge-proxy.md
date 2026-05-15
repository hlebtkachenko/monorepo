---
phase: 04-edge-proxy
reviewed: 2026-05-15T00:00:00Z
depth: deep
files_reviewed: 1
files_reviewed_list:
  - apps/web/proxy.ts
findings:
  blocker: 2
  warning: 5
  info: 3
  critical: 2
  total: 10
status: issues_found
---

# Phase 04: Edge Auth Proxy Code Review

**Reviewed:** 2026-05-15
**Depth:** deep (cross-file tracing through login forms + layout consumers)
**Files Reviewed:** 1 (with cross-file consumer trace)
**Status:** issues_found

## Summary

`apps/web/proxy.ts` is structurally sound: it does the right shape of work (optimistic cookie presence check at the edge, layout-side DB validation in Node). The architecture comment is accurate about the threat model split.

The **bugs are not in `proxy.ts` in isolation — they live in the contract between proxy and consumer**. The proxy emits `next` into the URL; the login forms consume `next` without sanitization and push it into `router.push()` and `callbackURL`. The result is a textbook open-redirect (CR-01) and a sensitive-query-string leak (CR-02). Because the review scope is the proxy, both findings document the proxy-side fix (sanitize before emit) AND the consumer-side fix (sanitize before consume — defense in depth).

Secondary findings: misleading security claims in the docstring, drift between the documented route path (`(app)/workspace/...`) and the real path (`app/workspace/...`), and a blanket `/onboarding` exclusion that puts all weight on per-page guards that are inconsistently applied across the wizard.

---

## Critical Issues

### CR-01: Open redirect via unsanitized `next` query param (BLOCKER)

**File:** `apps/web/proxy.ts:26-30`
**Consumers:** `apps/web/app/auth/(default)/login/login-email-form.tsx:54,97`, `apps/web/app/auth/(default)/login/password/login-password-form.tsx:36,64,72,76`, `apps/web/app/auth/(default)/login/mfa/login-mfa-form.tsx:35,66`

**Issue:**
The proxy builds `next` from `request.nextUrl.pathname + request.nextUrl.search` and forwards it through `?next=...`. Downstream, the login forms read this value and feed it directly into navigation:

```ts
// login-email-form.tsx:54, 97
const next = search.get("next") ?? "/workspace"
const nextHref = `/auth/login/password` + (next !== "/workspace" ? `?next=${encodeURIComponent(next)}` : "")
router.push(nextHref)

// login-password-form.tsx:64, 76
await authClient.signIn.email({ ..., callbackURL: next })
router.push(next)

// login-mfa-form.tsx:66
router.push(next)
```

Neither side validates that `next` is a same-origin relative path. Two exploit paths:

1. **Protocol-relative open redirect.** An attacker sends `https://app.example.com//evil.com/anything`. Next.js normalizes `request.nextUrl.pathname` to `//evil.com/anything`. The proxy redirects to `/auth/login?next=%2F%2Fevil.com%2Fanything`. After login, `router.push("//evil.com/anything")` is treated by the browser as a protocol-relative URL and navigates to `https://evil.com/anything` — credential phishing surface, session-fixation surface for OAuth flows.

2. **Direct injection (proxy-bypassing).** The login route is excluded from the matcher (`/auth/*`). An attacker can craft `https://app.example.com/auth/login?next=https://evil.com/`. `useSearchParams().get("next")` returns `https://evil.com/` verbatim, then `router.push("https://evil.com/")` performs a full-page navigation to the attacker site post-authentication. Better Auth's `callbackURL: next` (line 64) is also a confused-deputy here — if Better Auth's server validates origin, the JSON sign-in succeeds but the client-side `router.push(next)` still leaks the user out.

**Fix (edge — defense in depth, kill the attack at the proxy):**
```ts
export function proxy(request: NextRequest): NextResponse {
  const sessionCookie = getSessionCookie(request)
  if (!sessionCookie) {
    const loginUrl = new URL("/auth/login", request.url)
    const rawIntended = request.nextUrl.pathname + request.nextUrl.search
    const intended = sanitizeRelativePath(rawIntended)
    if (intended && intended !== "/") {
      loginUrl.searchParams.set("next", intended)
    }
    return NextResponse.redirect(loginUrl)
  }
  return NextResponse.next()
}

function sanitizeRelativePath(p: string): string | null {
  // Must start with exactly one slash and not be protocol-relative (//) or
  // backslash-tricked (/\\evil.com). Reject anything containing a scheme.
  if (!p.startsWith("/")) return null
  if (p.startsWith("//") || p.startsWith("/\\")) return null
  if (/^\/[A-Za-z][A-Za-z0-9+.-]*:/.test(p)) return null // /javascript:..., /https:...
  return p
}
```

**Fix (consumer — primary, because the login route is matcher-excluded):**
All three login forms must sanitize before `router.push(next)` and before passing `callbackURL: next` to Better Auth:
```ts
function safeNext(raw: string | null, fallback = "/workspace"): string {
  if (!raw) return fallback
  if (!raw.startsWith("/")) return fallback
  if (raw.startsWith("//") || raw.startsWith("/\\")) return fallback
  if (/^\/[A-Za-z][A-Za-z0-9+.-]*:/.test(raw)) return fallback
  return raw
}
const next = safeNext(search.get("next"))
```

Apply the same helper in **all three** consumer files. Sanitizing in only one is a half-fix.

---

### CR-02: Information leakage — full query string echoed into `?next=...` (BLOCKER)

**File:** `apps/web/proxy.ts:27`

**Issue:**
```ts
const intended = request.nextUrl.pathname + request.nextUrl.search
```

`request.nextUrl.search` carries the full original query string, including tokens, IDs, search terms, and any PII the deep link contained. After redirect, the **entire query string is visible** in:

- The user's browser history as `https://app/auth/login?next=%2F[orgSlug]%2Finbox%3Finvoice_token%3DSECRET%26customer_email%3Dfoo%40bar.com`
- HTTP server access logs (nginx / CloudFront / ALB log the full request URI by default)
- Sentry breadcrumbs and replay sessions (this app has `withSentryConfig` per `next.config.mjs:27`)
- Referer headers sent to any third-party asset/script on the `/auth/login` page

For an accounting product, plausible PII in query strings: invoice IDs, magic-link tokens (if the team ever introduces them per route), email addresses in `?email=...` patterns, customer slug, document UUID, transaction IDs. None of these belong in a redirect-back parameter.

**Fix:**
Echo only the pathname; drop the query string. Anything the user needs preserved through login can be reconstructed by the destination page from session state or re-asked. If a destination genuinely needs to preserve query, that destination should set its own intermediate cookie.

```ts
const intended = request.nextUrl.pathname
if (intended !== "/") {
  loginUrl.searchParams.set("next", intended)
}
```

If you must preserve query, allowlist specific param names per-route and drop the rest. Never wildcard-forward.

---

## Warnings

### WR-01: Misleading docstring overstates the proxy's security guarantee

**File:** `apps/web/proxy.ts:13-18`

**Issue:**
```
The optimistic check is the right shape for two reasons:
  ...
  2. Better Auth signs the session cookie; an attacker cannot forge one
     without `BETTER_AUTH_SECRET`. Cookie presence is a strong signal,
     not a strong proof.
```

`getSessionCookie` (better-auth `dist/cookies/index.mjs:169`) is a **string lookup** — it parses the `Cookie` header and returns the raw value if a cookie with the expected name exists. **No signature verification happens.** The proxy accepts ANY string in `better-auth.session_token` (or `__Secure-...`) as proof of cookie presence, including:
- A revoked session token
- A garbage value the attacker pastes via DevTools
- A leaked token from another tenant

The downstream layout DB check catches all of these — so the system is safe — but the docstring claims a property the proxy itself does not enforce. A future maintainer reading this comment may assume `getSessionCookie() !== null` implies a real signed session and write code that trusts it.

**Fix:**
```
2. Better Auth signs the session cookie. Even though this proxy only
   checks PRESENCE (not signature), a forged or stale cookie is rejected
   by the Node-runtime layout that loads the session from Postgres. The
   proxy is a cheap pre-filter, not a trust boundary. Authorization
   decisions MUST happen in layouts / route handlers, never here.
```

---

### WR-02: Docstring references a route group `(app)` that does not exist

**File:** `apps/web/proxy.ts:9-10`

**Issue:**
```
that happens in route layouts (`(app)/workspace/layout.tsx`,
`(app)/[orgSlug]/layout.tsx`)
```

Actual paths: `apps/web/app/workspace/layout.tsx` and `apps/web/app/[orgSlug]/layout.tsx`. No `(app)` route group exists in `apps/web/app/`. Either the route group was renamed/removed and the comment was not updated, or the comment was speculative. Either way it is a stale signpost for the next reader who tries to navigate from the proxy to the real validator.

**Fix:** Drop the `(app)` prefix.

---

### WR-03: Blanket `/onboarding/*` exclusion + inconsistent per-page guards

**File:** `apps/web/proxy.ts:50-51` (matcher), per-page guards in `apps/web/app/onboarding/**/page.tsx`

**Issue:**
The matcher excludes the entire `/onboarding/*` tree. The justification (steps 1–2 are pre-account-creation, so no session exists yet) is sound for `profile` and `experience`. But the proxy then puts 100% of the gating weight on per-page guards inside `onboarding/`, which are inconsistently applied:

| Page | Session check? |
|---|---|
| `(owner)/profile/page.tsx` | No (correct — pre-account) |
| `(owner)/experience/page.tsx` | No (correct — pre-account) |
| `(owner)/password/page.tsx` | Reads `readSignupClaims()` cookie (correct) |
| `(owner)/workspace/page.tsx` | `auth.api.getSession` + `assertOwnerOnStep` ✓ |
| `(owner)/team/page.tsx` | `auth.api.getSession` + `assertOwnerOnStep` ✓ |
| `(owner)/done/page.tsx` | `auth.api.getSession` + DB write ✓ |
| `member/done/page.tsx` | **No session check** |

`apps/web/app/onboarding/member/done/page.tsx` reads no session at all — anyone can `GET /onboarding/member/done` and view the success card. The card itself is mostly cosmetic (no PII rendered), but the page would happily render to a logged-out attacker scraping route enumeration data, and any future addition to the card that depends on `session.user.email` would be a silent regression with no proxy safety net.

**Fix:**
Two options, pick one and document it:

1. **Tighten matcher.** Exclude only specific pre-account paths: `/onboarding/profile`, `/onboarding/experience`. Gate everything else at the proxy. This is the safer default.

   ```ts
   matcher: [
     "/((?!api|auth|onboarding/profile|onboarding/experience|_next/static|_next/image|favicon\\.ico|$).*)",
   ]
   ```

2. **Keep current matcher, enforce uniform guards.** Add `auth.api.getSession()` + redirect to every `onboarding/*/page.tsx` that is post-account (everything except `profile` and `experience`). Audit explicitly — including `member/done/page.tsx` which is currently unguarded.

Either way, ADR-document the rule so the next page added to `/onboarding` does not silently inherit the wrong default.

---

### WR-04: Hardcoded login path — does not respect i18n route prefix

**File:** `apps/web/proxy.ts:26`

**Issue:**
`new URL("/auth/login", request.url)`. The app uses `next-intl` (`next.config.mjs:4`). If routes are ever localized (`/cs/auth/login`, `/uk/auth/login`), the proxy will redirect across locales and lose the user's chosen locale across the auth boundary. Not a bug today because `i18n/request.ts` does not appear to mount routes under a locale prefix, but worth a TODO so the next person to enable localized routing doesn't ship a UX regression.

**Fix:** Add a one-line comment: `// Plain /auth/login — revisit if next-intl ever mounts locale-prefixed routes.`

---

### WR-05: `getSessionCookie` config is not pinned

**File:** `apps/web/proxy.ts:24`

**Issue:**
```ts
const sessionCookie = getSessionCookie(request)
```

No `config` argument passed. The function defaults to `cookieName: "session_token", cookiePrefix: "better-auth"` (verified in `better-auth/dist/cookies/index.mjs:172`). If the auth setup in `@workspace/auth/server` ever overrides `cookiePrefix` or `cookieName` (e.g., to namespace per-environment cookies, or to migrate to `afframe-session`), the proxy will silently start treating EVERY request as logged-out (because the cookie name no longer matches), breaking all gated routes. Failure mode: hard to detect in CI (the test would have to actually log in with the configured prefix).

**Fix:**
Either import the canonical prefix/name from `@workspace/auth/shared` and pass it:
```ts
import { SESSION_COOKIE_PREFIX, SESSION_COOKIE_NAME } from "@workspace/auth/shared"
const sessionCookie = getSessionCookie(request, {
  cookieName: SESSION_COOKIE_NAME,
  cookiePrefix: SESSION_COOKIE_PREFIX,
})
```
Or add a unit test that asserts `getSessionCookie` defaults match the configured Better Auth instance.

---

## Info

### IN-01: Matcher regex — explicit root exclusion would be clearer

**File:** `apps/web/proxy.ts:51`

**Issue:** The `|$` term inside the negative lookahead excludes `/` (path becomes empty after the leading slash, end-of-string matches `$`, lookahead fails, route is skipped). This is correct but non-obvious — `$` inside a `(?!...)` alternation reads as "or end of string", and a casual reviewer cannot tell at a glance whether `/` is gated.

**Fix:**
Either keep the regex and add a comment, or replace with the more readable form:
```ts
matcher: [
  // Match any path except: API routes, auth/onboarding flows, Next.js
  // internals, favicon, and the public landing page (exact "/").
  {
    source: "/((?!api|auth|onboarding|_next/static|_next/image|favicon\\.ico).+)",
  },
]
```
The `.+` (vs `.*`) requires at least one character after `/`, which naturally excludes `/`. Equivalent semantically, more obvious.

---

### IN-02: Return type annotation is technically incorrect

**File:** `apps/web/proxy.ts:23`

**Issue:**
```ts
export function proxy(request: NextRequest): NextResponse {
```

Both branches return `NextResponse` (`.redirect()` and `.next()`), so the annotation is correct for current behavior. However, idiomatic Next.js middleware/proxy signatures return `NextResponse | undefined | Promise<NextResponse | undefined>` to allow future async DB-backed checks or "fall through" returns. Tightening to `NextResponse` forces a future maintainer to widen the signature when adding async logic, which is a small but real friction point.

**Fix:** No change required today. If/when async logic is added, widen to `NextResponse | Promise<NextResponse>`.

---

### IN-03: `intended !== "/"` check is dead under the current matcher

**File:** `apps/web/proxy.ts:28`

**Issue:**
```ts
const intended = request.nextUrl.pathname + request.nextUrl.search
if (intended !== "/") {
  loginUrl.searchParams.set("next", intended)
}
```

The matcher already excludes `/` (the public landing page). The proxy function therefore never executes with `request.nextUrl.pathname === "/"` (unless `request.nextUrl.search` happens to be present, which would make `intended` something like `/?foo=bar`, also not equal to `"/"`). The `intended !== "/"` guard never fires in practice.

This is not a bug — it's defense-in-depth in case the matcher changes — but it should be **either deleted (and re-added if/when the matcher includes `/`) or commented as deliberate belt-and-braces**.

**Fix:**
```ts
// Defensive: matcher excludes "/" today, but keep this guard so a future
// matcher change cannot silently produce `?next=/` redirect loops.
if (intended !== "/") {
  loginUrl.searchParams.set("next", intended)
}
```

---

## Defense-in-Depth Summary

| Layer | Today | After Fix |
|---|---|---|
| Proxy (edge) | Forwards raw `pathname + search` into `next` | Sanitizes path, drops query |
| Login form (client) | `router.push(next)` unchecked | `router.push(safeNext(next))` |
| Better Auth `callbackURL` | Trusts whatever client sends | Server-side allowlist (verify Better Auth config) |
| Layout (Node) | DB-validates session ✓ | Unchanged — already correct |

The proxy is the wrong layer to do the **full** open-redirect fix (because `/auth/login` is matcher-excluded, an attacker reaches the login form without ever transiting the proxy). The proxy fix is necessary belt-and-braces; the **load-bearing** fix is in the three login form files.

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
