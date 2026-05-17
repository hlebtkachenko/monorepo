# Review 02: auth/server.ts + tokens/jwt.ts

## Critical (SECURITY)

- **[packages/auth/src/server.ts:46]** `secret: process.env.BETTER_AUTH_SECRET` is passed through without validation. If `BETTER_AUTH_SECRET` is unset, Better Auth falls back to a known/default value (and prints a console warning), which silently downgrades the entire session-signing pipeline to a non-secret in any misconfigured environment, including production. The current code provides zero guarantee that the process will refuse to boot without a secret.
  Fix: assert at module load. Mirror the pattern used in `tokens/jwt.ts` but make it fail-closed in production:
  ```ts
  const BETTER_AUTH_SECRET = process.env.BETTER_AUTH_SECRET
  if (!BETTER_AUTH_SECRET || BETTER_AUTH_SECRET.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must be set to a 32+ byte value")
  }
  // ...
  secret: BETTER_AUTH_SECRET,
  ```

- **[packages/auth/src/server.ts:47-48]** `baseURL` and `trustedOrigins` have no validation. An empty `trustedOrigins` (the default when `BETTER_AUTH_TRUSTED_ORIGINS` is unset) means BA falls back to allowing only `baseURL`; combined with an unset `baseURL` this opens CSRF/origin-check edge cases on email-link callbacks. Also, `.split(",")` does not trim whitespace, so `"https://a.com, https://b.com"` produces `" https://b.com"` and silently fails origin matching at runtime.
  Fix: validate + trim:
  ```ts
  baseURL: process.env.BETTER_AUTH_URL ?? throwIfProd("BETTER_AUTH_URL"),
  trustedOrigins: (process.env.BETTER_AUTH_TRUSTED_ORIGINS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  ```

- **[packages/auth/src/server.ts:121-136]** No `requireEmailVerification` flag and no rate limiting visible on `emailAndPassword`. With `autoSignIn: true` (line 130), a signup with an unverified email immediately receives a valid session. Combined with no rate limit on `/api/auth/sign-in/email`, this surface is exposed to credential-stuffing and signup-flooding. Better Auth supports `rateLimit: { enabled: true, ... }` and `emailAndPassword.requireEmailVerification: true` — neither is configured.
  Fix: enable BA's built-in rate limiter and decide explicitly whether verification is required before sign-in:
  ```ts
  rateLimit: { enabled: true, window: 60, max: 10 },
  emailAndPassword: {
    ...,
    requireEmailVerification: true, // or document why false is intentional
  },
  ```

- **[packages/auth/src/tokens/jwt.ts:14-25]** `secret` is computed at module-load time. If `APP_TOKEN_SECRET` is unset at import (very common during test bootstrapping, Next.js edge bundling, or anywhere the env is loaded after module init), `secret` is permanently `null` for the lifetime of that module instance. Every call to `requireSecret()` then throws `"APP_TOKEN_SECRET is not set..."`, but the failure mode is order-dependent: in production a misconfigured deploy can pass health checks (server.ts boots fine) and only fail later on the first signup-link click. The test file (`jwt.test.ts:5-7`) already shows this trap — it sets the env in `beforeAll` and must call `vi.resetModules()` before every `await import("./signup")` to re-run the module factory. The "cache the secret in a module-level IIFE" pattern is fundamentally fragile here.
  Fix: resolve the secret lazily inside `requireSecret()`:
  ```ts
  let cached: Uint8Array | null = null
  function requireSecret(): Uint8Array {
    if (cached) return cached
    const raw = process.env.APP_TOKEN_SECRET
    if (!raw) throw new Error("APP_TOKEN_SECRET is not set")
    if (raw.length < 32) throw new Error(`APP_TOKEN_SECRET must be >= 32 bytes (got ${raw.length})`)
    cached = new TextEncoder().encode(raw)
    return cached
  }
  ```
  This eliminates the `vi.resetModules()` dance in tests and makes the boot-time-vs-runtime ordering irrelevant.

- **[packages/auth/src/tokens/jwt.ts:19]** Length check is on string `.length`, not byte length. `APP_TOKEN_SECRET.length` counts UTF-16 code units, so a 32-character secret containing emoji or multibyte characters can be fewer than 32 bytes of entropy after `TextEncoder().encode(raw)`. The error message ("must be at least 32 bytes (got " + raw.length + ")") is also misleading — it reports characters, not bytes.
  Fix:
  ```ts
  const encoded = new TextEncoder().encode(raw)
  if (encoded.length < 32) {
    throw new Error(`APP_TOKEN_SECRET must be at least 32 bytes (got ${encoded.length})`)
  }
  return encoded
  ```

- **[packages/auth/src/tokens/jwt.ts:42-53, 65-100]** Algorithm allowlist is NOT enforced on verify. `jwtVerify(token, key, options)` without an explicit `algorithms: ["HS256"]` option in `options` accepts any algorithm the underlying key material supports. With a symmetric `Uint8Array` key jose will refuse RSA/EC algs, but the call still falls through algorithm-confusion variants for HS family. Also, `alg: "none"` is rejected by jose by default, but defense-in-depth requires the explicit allowlist. This is the canonical JWT vulnerability class — pinning algorithms is mandatory.
  Fix:
  ```ts
  const { payload } = await jwtVerify(token, requireSecret(), {
    issuer: ISSUER,
    audience: expectedKind,
    algorithms: ["HS256"],
    clockTolerance: 30, // also missing — see below
  })
  ```

## High (QUALITY)

- **[packages/auth/src/tokens/jwt.ts:65-100]** No `clockTolerance` on `jwtVerify`. Short-lived tokens (signup/invite/onboarding) become brittle if any clock drift exists between the issuing process and the verifying process. jose accepts string or seconds; a 30s tolerance is industry standard and harmless. Without it, a token signed at `now()` and verified within 1s on a host with -2s clock offset will fail `nbf`/`iat` checks intermittently.
  Fix: add `clockTolerance: 30` to the `jwtVerify` options.

- **[packages/auth/src/tokens/jwt.ts:80]** `return payload as unknown as TClaims`. The double-cast bypasses every type check. The runtime has already verified `payload.kind === expectedKind` but the shape of `TClaims` beyond `kind` is never validated. A token with arbitrary extra/missing claims will type-check and silently flow into consumers as `SignupClaims` / `LoginEmailClaims` etc. Any consumer doing `claims.email.toLowerCase()` will throw `Cannot read properties of undefined` for a malformed payload that survived signature verification but came from a different code version of `signSignupToken`.
  Fix: parse with a Zod schema per token kind. Either inline (`SignupClaimsSchema.parse(payload)`) or pass a parser into `verifyToken`:
  ```ts
  export async function verifyToken<TClaims extends BaseClaims>(
    token: string,
    expectedKind: TClaims["kind"],
    parse: (raw: unknown) => TClaims,
  ): Promise<TClaims> { ... return parse(payload) }
  ```

- **[packages/auth/src/tokens/jwt.ts:46]** `{ ...(claims as Record<string, unknown>) }` — the cast is unnecessary and disables type checking on `SignJWT`'s input. The cleaner form `new SignJWT({ ...claims })` works because `TClaims extends BaseClaims` is constrained to object types. As written, a future change to `SignJWT`'s signature (e.g. stricter typing) would not surface as a TS error here.
  Fix: drop the cast:
  ```ts
  return await new SignJWT({ ...claims })
  ```

- **[packages/auth/src/tokens/jwt.ts:51]** Manual `setExpirationTime(Math.floor(Date.now() / 1000) + ttlSeconds)`. jose accepts a string duration directly (`.setExpirationTime("${ttlSeconds}s")` or `.setExpirationTime(`${ttlSeconds} seconds`)`), or you can chain `.setNotBefore` and let jose compute exp. The manual epoch arithmetic invites off-by-one timezone confusion and bypasses jose's internal validation that exp > iat.
  Fix:
  ```ts
  .setIssuedAt()
  .setExpirationTime(`${ttlSeconds}s`)
  ```

- **[packages/auth/src/tokens/jwt.ts:95-99]** Final `catch` clause leaks raw error messages from jose / runtime through `(err as Error).message`. For an attacker probing token shapes, distinguishing "Invalid Compact JWS" from "JWT iss check failed" from "JWE signature verification failed" is reconnaissance signal. The earlier branches (lines 85-94) already map known jose errors to a flat `INVALID` — the trailing fallback should do the same instead of forwarding the underlying message.
  Fix:
  ```ts
  throw new TokenError("Invalid token", "INVALID")
  ```
  Log the original `err` server-side if needed for debugging, but never return it to the client.

- **[packages/auth/src/server.ts:151-178]** Plugin ordering correctness depends on a comment, not a type-level invariant. `nextCookies()` must be last; if anyone re-orders this list during a future merge (e.g. adding `oauth()` after `nextCookies()`), cookies silently stop forwarding and the only failure signal is the "infinite redirect from /onboarding/workspace" bug that motivated `autoSignIn: true` in the first place. The hazard is documented but not prevented.
  Fix: assert in a unit test or extract a `buildPlugins()` helper that appends `nextCookies()` last unconditionally:
  ```ts
  const plugins = [admin(), twoFactor({ ... })]
  // ... future plugins push to `plugins` ...
  plugins.push(nextCookies()) // always last
  ```

- **[packages/auth/src/server.ts:131-132]** `minPasswordLength: 12` is good, but there is no zxcvbn / pwned-passwords check and no documented password policy. A 12-character password of `aaaaaaaaaaaa` passes. Better Auth supports a `password.hash`/`password.verify` override; either plug in zxcvbn here or document the decision.
  Fix: either add a strength check or add a comment + ADR explaining the bare-length-only policy.

## Medium (SIMPLIFY)

- **[packages/auth/src/tokens/jwt.ts:55-63]** `TokenError` has a code `"DISABLED"` that is never thrown anywhere in the codebase (grep confirms only INVALID / EXPIRED / WRONG_KIND are thrown). Dead enum member.
  Fix: drop `"DISABLED"` from the union, or throw it from `requireSecret()` instead of the bare `Error`.

- **[packages/auth/src/tokens/jwt.ts:36]** `const ISSUER = "app"` is a magic string. If you ever federate this signing logic to a second service (e.g. an admin worker), every issuer becomes `"app"` and the iss claim provides zero authorization signal.
  Fix: derive from env or at minimum pin to a more specific value like `"afframe-web"`:
  ```ts
  const ISSUER = process.env.APP_TOKEN_ISSUER ?? "afframe-web"
  ```

- **[packages/auth/src/tokens/jwt.ts:49]** Audience is the token's own `kind`. This is unusual — `aud` is meant to identify the recipient, not the message type. The same value being asserted on both `audience` (line 72) and `payload.kind` check (line 74) is redundant: if the signed audience matches `expectedKind`, the kind claim will too (and vice versa, because the same code wrote both). Either remove the post-hoc `payload.kind` check or remove the `audience` assertion.
  Fix: drop the `aud`/`audience` setup and rely on the explicit `kind` check (which is more readable), OR drop the kind check and use `aud` alone. Pick one.

- **[packages/auth/src/server.ts:62-73]** `additionalFields.locale` and `.timezone` declare `defaultValue: "en"` / `"UTC"` here, while the Drizzle table almost certainly has its own column-level defaults. Two sources of truth for the same default — if they diverge (e.g. someone changes the DB default to `"en-US"`), Better Auth will silently re-set `"en"` on user creation.
  Fix: drop the `defaultValue` here and rely on the DB column default, or drop the DB default and own it here. Document which side is canonical.

- **[packages/auth/src/server.ts:46-48]** Three env lookups inline in the config literal. Considering the validation work each of them needs (see Critical findings above), pulling them into named consts at the top of the file improves readability and makes the validation block obvious to reviewers.
  Fix: extract `const SECRET = ...`, `const BASE_URL = ...`, `const TRUSTED = ...` above the `betterAuth({...})` call.

- **[packages/auth/src/tokens/jwt.test.ts:11, 23, 43, 57, 70]** Every single test starts with `vi.resetModules()` then re-imports the module. This is a hard signal that the module-load-time secret caching (Critical finding above) is causing test friction. Once that caching is moved into a lazy `requireSecret()`, all of these can collapse into a single top-level `import` and `beforeAll` env setup.

## Info

- **[packages/auth/src/tokens/jwt.test.ts:1-78]** Coverage gaps relative to the verify path in `jwt.ts`:
  - No test for an HS256 token signed with a DIFFERENT secret (algorithm-correct, signature-incorrect) — currently the only "wrong sig" test is a tampered base64 blob, which exercises the same `JWSSignatureVerificationFailed` path but doesn't confirm key isolation.
  - No test for wrong issuer (token signed with `iss: "other"` should fail with INVALID).
  - No test for wrong audience (token issued for `aud: "invite"` and verified with `expectedKind: "signup"` should fail — important because this is the only thing preventing cross-flow token reuse).
  - No test asserting `alg: "none"` and algorithm-confusion attempts are rejected (once `algorithms: ["HS256"]` is added per Critical finding, add a test that hand-rolls an `alg: "none"` JWT and confirms rejection).
  - No test for clock skew once `clockTolerance` is added.
  - No test that the `kind` mismatch path (line 74-79) is reachable independent of the `audience` path. Today, because `aud === kind` (see Medium finding), this branch is dead code.

- **[packages/auth/src/server.ts:13-33]** Excellent docblock. No action.

- **[packages/auth/src/tokens/invite.ts:36-38]** `hashInviteToken` uses SHA-256 without a pepper. For 256-bit random tokens this is correct (no need to slow down hashing — the token itself is uniformly random) and the comment in the test file at line 35 acknowledges this. No action, just confirming the design is sound.

- **[packages/auth/src/tokens/jwt.ts:81]** The `catch (err)` rebinds `err` to `unknown` (TS strict mode) and the code handles each instanceof branch correctly. Good defensive style.

- The `Auth` type export (server.ts:181) is used downstream — keep.

## Summary

- Findings: 6 critical, 7 high, 6 medium, 5 info
- Recommendation: **FIX BEFORE COMMIT**

The most urgent items:
1. Algorithm allowlist on `jwtVerify` (line 70) — pin `algorithms: ["HS256"]` (defense-in-depth).
2. Lazy secret resolution in `tokens/jwt.ts` — module-load caching is fragile and is already causing `vi.resetModules()` proliferation in tests.
3. Fail-closed validation of `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL`, and `BETTER_AUTH_TRUSTED_ORIGINS` in `server.ts`. As written, all three can silently fall back to insecure defaults.
4. Decide on rate-limiting policy + email-verification gate before this ships to production. Better Auth has both as opt-ins; not configuring them is a deployment decision that needs to be explicit.

The token JWT helper is otherwise on the right shape (HS256, iss/aud/exp claims, typed error codes, kind discriminator). Once the algorithm allowlist + lazy secret + Zod-validated payload land, this file is solid.
