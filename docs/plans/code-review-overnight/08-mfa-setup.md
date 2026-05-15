---
phase: 08-mfa-setup
reviewed: 2026-05-15T00:00:00Z
depth: deep
files_reviewed: 5
files_reviewed_list:
  - apps/web/app/auth/mfa/setup/mfa-setup-form.tsx
  - apps/web/app/auth/mfa/setup/page.tsx
  - apps/web/app/auth/(default)/login/mfa/login-mfa-form.tsx
  - packages/auth/src/server.ts
  - packages/auth/src/client.ts
findings:
  critical: 4
  warning: 7
  info: 4
  total: 15
status: issues_found
---

# Phase 08: MFA Setup Form — Code Review

**Reviewed:** 2026-05-15
**Depth:** deep
**Files Reviewed:** 5
**Status:** issues_found

## Summary

The MFA setup form correctly gates enrollment behind a password challenge and uses Better Auth's `twoFactor.enable` / `twoFactor.verifyTotp` endpoints (so CSRF, replay, and rate limiting inherit from Better Auth's protections). The two-step `password -> verify` flow is sound in shape.

However the implementation has serious gaps:

1. **Backup codes are silently discarded.** Better Auth's `enable` endpoint returns `{ totpURI, backupCodes: string[] }`. This form reads only `totpURI`, never surfaces `backupCodes` to the user, and never persists/exports them. A user who completes enrollment has zero recovery path — losing the authenticator phone permanently locks the account out. This is the single most important defect.
2. **No QR code is rendered.** The form dumps the raw `otpauth://` URI and the base32 secret in two `<code>` blocks. Every supported authenticator app expects to scan a QR; manual entry of a 32-character base32 secret is hostile UX and pushes users to copy the secret into clipboards / screenshots, increasing leak surface.
3. **The secret is needlessly extracted and re-rendered.** `extractSecret(totpURI)` parses the URI client-side and stores `secret` separately in React state, duplicating sensitive material that's already in the URI. Render-time output includes both the URI and the raw secret, so view-source / browser devtools / accessibility tree show the secret twice for the lifetime of the verify stage.
4. **No "abandon enrollment" path.** If the user closes the tab mid-flow, Better Auth has already written a `two_factor` row with `verified=false`. The next visit hits `twoFactor.enable` again, which `deleteMany`s the prior row and starts over (the server tolerates this), but the form has no way to step back from `verify` to `password` if the user wants to re-scan with a different account label or cancel.

There are no injection / XSS / hardcoded-secret issues. The bigger problem is the security UX gap, not exploitable vulnerabilities.

---

## Critical Issues

### CR-01: Backup codes returned by `enable` are silently dropped — account is permanently lockoutable

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:43-57`
**Issue:**
`authClient.twoFactor.enable({ password })` returns `{ totpURI, backupCodes: string[] }` (confirmed from `better-auth/dist/plugins/two-factor/index.d.mts:103-105` and `index.mjs:120-136`, which calls `generateBackupCodes` and includes the plaintext codes in the response). The form extracts only `totpURI` via a narrowed type cast and discards `backupCodes` entirely. The user never sees, never copies, never downloads, never prints them.

Result: if the user loses their authenticator (lost phone, wiped Authy, factory reset 1Password), there is no recovery. The plaintext codes only exist on the wire once — Better Auth stores them encrypted in `two_factor.backup_codes` and never returns them again except via the admin-only `viewBackupCodes` endpoint (which takes `userId` and is not exposed to end users).

The `twoFactor.generateBackupCodes` endpoint can regenerate codes later, but only with the user's password — useless if MFA is already locking them out before they can hit the password prompt.

This is the textbook MFA enrollment defect.

**Fix:**
```tsx
type EnrollResult = { totpURI: string; backupCodes: string[] }

interface EnrollState {
  totpURI: string
  secret: string
  backupCodes: string[]
}

const result = await authClient.twoFactor.enable({ password })
if (result.error) { /* ... */ }
const data = result.data as EnrollResult | null
if (!data?.totpURI || !data.backupCodes?.length) {
  setError("Enrollment payload incomplete.")
  return
}
setEnroll({
  totpURI: data.totpURI,
  secret: extractSecret(data.totpURI),
  backupCodes: data.backupCodes,
})
```

Then in the verify stage, before allowing `verifyTotp`, force the user to acknowledge they have saved the backup codes (checkbox + "Download .txt" / "Copy all" buttons). A common pattern is a third stage `backup` between `password` and `verify`. Confirmation must be required — do not enable the Confirm button until the user has actively acknowledged.

After `verifyTotp` succeeds, scrub `backupCodes` from state immediately (`setEnroll(null)`) so they don't linger in React devtools.

---

### CR-02: No QR code rendered — manual base32 entry is the only path

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:132-144`
**Issue:**
The verify stage shows only the raw `otpauth://totp/...?secret=ABCDEF...` URI and the extracted base32 secret as `<code>` blocks. Google Authenticator, Authy, 1Password, Bitwarden — every authenticator app in the description text — expects a QR scan. Asking users to copy a 26+ character base32 string into a mobile app is hostile, makes typo lockouts near-certain, and encourages the user to take a screenshot or paste the secret into a notes app to retype it — both leak surfaces.

The description literally says "Scan this in your authenticator app" while there is nothing to scan.

**Fix:**
Render a QR code from `totpURI`. With Next.js, two equally valid options:

1. Server-side: generate the QR as a `data:image/svg+xml` URL on the server (using `qrcode`) and pass it down. Avoids shipping the QR library to the client.
2. Client-side: use a small React-only library (`qrcode.react` is ~10KB). Acceptable here because the secret is already on the client anyway; rendering a QR locally does NOT widen the leak surface (it's the same bits, in a different visual format).

The "Show secret instead" toggle should be collapsed by default — only opened for users whose phone camera fails.

```tsx
import QRCode from "qrcode.react"
// ...
<QRCode value={enroll.totpURI} size={192} level="M" />
<details>
  <summary className="text-sm text-muted-foreground">
    Cannot scan? Enter the secret manually.
  </summary>
  <code className="block ...">{enroll.secret}</code>
</details>
```

---

### CR-03: Plaintext TOTP URI and secret are rendered into the DOM with no rate-limit or session-loss safeguard

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:136-142`
**Issue:**
Both `enroll.totpURI` (which embeds the secret as a query param) and `enroll.secret` are rendered as plain text children. This is fine if and only if:

1. The page is not SSR'd with the data. Confirmed safe: this is a client component, the parent is a Suspense boundary, the parent server page (`page.tsx`) does not pre-fetch the enrollment data, so the secret is never serialized in the initial HTML payload. View-source on first paint will not leak it.
2. The browser tab is not screenshared / screen-recorded while the user is on this step. Not under our control.
3. The user does not navigate away and come back: state lives in React state only, so refresh discards it. Confirmed by `useState`-only persistence.

However:
- There is no auto-redaction after success: when `verifyTotp` resolves, `router.push("/workspace/profile?mfa=enabled")` fires, but `enroll` state is never cleared. Between `router.push` and the actual unmount of `<MfaSetupForm/>`, the secret is still in component state and still in the DOM. A Heap / Sentry session-replay tool would record it during the brief overlap. The login-mfa form has no equivalent issue because it never receives the secret.
- There is no "expired enrollment" handling. If the user lets the verify form sit overnight, the secret in state is fine (TOTP secrets do not expire), but the session cookie may have rolled past `updateAge`. A fresh `verifyTotp` call could fail with "session invalid" while the secret remains rendered. The user has no way to abandon the visible secret.

**Fix:**
1. Clear sensitive state before the navigation, not after:
```tsx
const verifyResult = await authClient.twoFactor.verifyTotp({ code })
if (verifyResult.error) { /* ... */ }
setEnroll(null)
setCode("")
setPassword("")
router.push("/workspace/profile?mfa=enabled")
```
2. Add a "Cancel enrollment" button on the verify stage that clears `enroll`, sets `stage` back to `password`, and clears `code` / `password`. Optionally call `authClient.twoFactor.disable({ password })` — but that requires the password again, so a softer cancel that just clears local state is acceptable since the unverified `two_factor` row will be cleaned up the next time `enable` is called.
3. If using session-replay or analytics tooling, mark the `<code>` blocks (and the `<input type=password>`) with `data-private`, `data-clarity-mask`, or whatever the chosen tool's mask attribute is. This codebase does not appear to use one, so this is preventive.

---

### CR-04: `extractSecret` duplicates the secret into state for no functional reason

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:55-56, 183-190`
**Issue:**
`extractSecret(totpURI)` parses the URI and stores the bare secret separately. The secret is then rendered as `enroll.secret` in the manual-entry block. There are two problems:

1. The secret already exists inside `totpURI` (which is also stored in state). Storing both doubles the in-memory footprint of the sensitive value and doubles the number of strings any memory dump / heap snapshot will surface.
2. `new URL("otpauth://totp/Issuer:user@example.com?secret=...")` works in modern browsers but Safari historically refused non-`http`/`https` schemes in the `URL` constructor. This was relaxed years ago but is still worth a quick verification — on a browser that throws, `extractSecret` returns `""`, the catch swallows the error silently, and the verify-stage UI renders an empty `<code>` block labelled "Secret (manual entry)" — the user thinks the secret is empty and the bug is invisible to error tracking.

**Fix:**
- Remove the separate `secret` field from `EnrollState`. Render the QR from `totpURI`. If a manual-entry fallback is genuinely needed, derive the secret inline at render time (or once with `useMemo`) from `totpURI`. Do not persist.
- Replace `new URL(...)` with a tolerant regex (`/[?&]secret=([^&]+)/`) since `otpauth://` URIs are not standard-compliant URLs in every implementation. Log to `console.error` (not Sentry — would leak the secret) when extraction fails so it's at least visible in dev.

Even better: don't parse the URI at all. Use a QR library that takes `otpauth://...` directly (every standard one does).

---

## Warnings

### WR-01: `result.data` is type-asserted as a hand-rolled shape, ignoring Better Auth's real return type

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:49`
**Issue:** `(result.data as { totpURI?: string } | null)?.totpURI` is a manual cast that:
1. Marks `totpURI` as optional even though Better Auth always returns it on a success path.
2. Drops `backupCodes` from the asserted type, which is how the form ends up losing them (CR-01 root cause — the type assertion blinds reviewers and TS to the real shape).
3. Bypasses Better Auth's actual response types, which are exported from `better-auth/plugins/two-factor`.

**Fix:** Import the real type or let TS infer it. The Better Auth React client's `authClient.twoFactor.enable` should return a typed `{ data, error }`. If the inferred type is `unknown`, audit whether the auth client setup in `packages/auth/src/client.ts` is properly applying plugin type inference (the `twoFactorClient()` plugin should surface these types). If types are genuinely lost at the call site, file an upstream issue / pin the type from the plugin's exports rather than handcrafting it locally.

---

### WR-02: `submitting` state is not reset on success in `onSubmitVerify`

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:73-84`
**Issue:**
On the verify success path, `router.push(...)` fires and `submitting` is never set back to `false`. If the navigation is slow (or fails — e.g., the user hit "Stop" in the browser), the button stays disabled and reads "Verifying…" indefinitely with no way to retry. The password handler is also asymmetric: it uses `finally { setSubmitting(false) }` (line 60-62) which correctly resets after navigation-less success, while verify uses a manual `setSubmitting(false)` inside each branch and omits it on success.

Two inconsistencies in one component for the same flag.

**Fix:** Use `finally` in both handlers (preferred), or remove `finally` from the password handler and match the verify handler. The `finally` form is safer because it always runs:
```tsx
async function onSubmitVerify(e: FormEvent<HTMLFormElement>) {
  e.preventDefault()
  if (code.length !== 6) { setError("..."); return }
  setError(null)
  setSubmitting(true)
  try {
    const result = await authClient.twoFactor.verifyTotp({ code })
    if (result.error) {
      setError(result.error.message ?? "Invalid code")
      return
    }
    setEnroll(null)
    setCode("")
    router.push("/workspace/profile?mfa=enabled")
  } catch (err) {
    setError((err as Error).message ?? "Invalid code")
  } finally {
    setSubmitting(false)
  }
}
```

---

### WR-03: `(err as Error).message ?? "..."` — `.message` exists but can be empty string, which defeats the fallback

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:59, 82`
**Issue:** `(err as Error).message ?? "Could not start enrollment"` — `??` only triggers on `null` / `undefined`. An `Error` with an empty `message` (which happens, especially for network errors thrown by `fetch` aborting) will set `error` to `""`, the `error ? <p>...</p> : null` check on line 109/165 evaluates `""` as falsy, and the UI shows no error at all. The user sees the spinner stop with no feedback.

Also, `err` may not be an `Error` instance (it could be a string, a `DOMException`, or a non-Error object). Casting and accessing `.message` is unsafe.

**Fix:**
```tsx
function asMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && err.message) return err.message
  if (typeof err === "string" && err) return err
  return fallback
}
// ...
setError(asMessage(err, "Could not start enrollment"))
```

Also change `result.error.message ?? "..."` (lines 45, 76) to the same helper for the same empty-string reason. Better Auth wraps server errors in `{ error: { message, status, code } }` and `message` can be falsy under some translation paths.

---

### WR-04: No `aria-describedby` linking the error message to its input

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:100-113, 145-169`
**Issue:** The `<Input id="password">` and `<InputOTP id="otp">` have no `aria-describedby` pointing to the error element. The error element has `role="alert"` which announces once on appearance, but screen readers won't re-announce on focus and won't associate the error with the field. The sibling `login-mfa-form.tsx` has the same issue but at least uses `data-invalid` on the `Field` wrapper, which is a small improvement.

**Fix:**
```tsx
<Input
  id="password"
  aria-invalid={error ? "true" : undefined}
  aria-describedby={error ? "password-error" : undefined}
  // ...
/>
{error ? (
  <p id="password-error" role="alert" className="text-sm text-destructive">
    {error}
  </p>
) : null}
```
Same for the OTP input. Use distinct IDs per stage so the wrong error doesn't get announced when the user is on the other stage.

---

### WR-05: `code.length !== 6` is a weak guard — non-digit input slips through to the server

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:67-70, 173`
**Issue:** The check on `code.length !== 6` blocks short codes but not garbage. Users can paste `abcdef`, `123XYZ`, or `12 345` (depending on `InputOTP` paste handling) and the form will submit it to the server. Better Auth will reject it with a generic "Invalid code" — fine, but it wastes a rate-limit slot (the plugin's rate limit is 3 requests / 10s) and produces a worse error message than a local "Enter only digits."

The sibling `login-mfa-form.tsx` uses a Zod schema (`OTPSchema`) on react-hook-form. This setup form rolled its own state and skipped validation.

**Fix:** Either reuse `OTPSchema` from `@workspace/shared/auth` for consistency, or add a quick guard:
```tsx
if (!/^\d{6}$/.test(code)) {
  setError("Enter the 6-digit code from your authenticator app.")
  return
}
```
This also tightens the rate-limit consumption (which actively matters during enrollment — three TOTP misclicks and the user is locked out for 10 seconds with the secret still on screen).

---

### WR-06: Inconsistent error handling between the two handlers — password handler swallows result errors twice

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:43-63`
**Issue:** `onSubmitPassword` has both `result.error` handling AND a `try/catch` around the call. Better Auth's client typically resolves the promise with `{ data: null, error: ... }` rather than throwing, so the `catch` block is dead in the common case. But if a network failure throws, the `catch` runs and `setSubmitting(false)` happens twice (once in the early-return branches at lines 46, 52, once in `finally`). Setting state twice in the same tick is benign but indicates the early returns are unnecessary — `finally` handles it.

Similarly, the verify handler has `setSubmitting(false)` inside both branches and also in the catch — three places to keep in sync.

**Fix:** Pick one pattern. The cleanest is to drop the inner `setSubmitting(false)` calls and rely on `finally`:
```tsx
try {
  const result = await authClient.twoFactor.enable({ password })
  if (result.error) {
    setError(result.error.message || "Could not start enrollment")
    return
  }
  // ... happy path
} catch (err) {
  setError(asMessage(err, "Could not start enrollment"))
} finally {
  setSubmitting(false)
}
```

---

### WR-07: Hardcoded redirect string with embedded query parameter

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:80`
**Issue:** `router.push("/workspace/profile?mfa=enabled")` hardcodes both the destination and a `?mfa=enabled` query parameter that the profile page does nothing with (verified in `apps/web/app/workspace/profile/page.tsx` — no `searchParams` read, no toast based on it). Dead query param, hardcoded path that will break silently if the profile page moves.

**Fix:** Either honour a `?next=` query param like the login flow does, or remove the unused `?mfa=enabled` suffix. If the intent was to show a success toast on the profile page, wire it up — a no-op query param is worse than no query param.

```tsx
const search = useSearchParams()
const next = search.get("next") ?? "/workspace/profile"
// ...
router.push(next)
```

(This pattern matches `login-mfa-form.tsx` for consistency.)

---

## Info

### IN-01: 190 lines is heavy because the two stages share one component — split it

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx` (entire file)
**Issue:** The line breakdown:
- 19 lines: imports
- ~10 lines: types
- ~30 lines: password handler
- ~22 lines: verify handler
- ~35 lines: password stage JSX
- ~58 lines: verify stage JSX
- ~10 lines: `extractSecret` helper

Roughly half the file is the verify stage JSX, which has its own set of state and its own form. Splitting into `<MfaSetupPasswordStep onEnrolled={enroll => ...}>` and `<MfaSetupVerifyStep enroll={...} onVerified={...}>` would let each component own only its state, simplify the conditional render, and shrink each unit to under 80 lines. Optional but improves reviewability and means the secret-bearing JSX lives in a tighter component.

**Fix:** Split into per-stage components. Lift `stage`, `enroll`, and the navigation effect into a small parent. Each stage component owns its own `submitting` / `error` / form state.

---

### IN-02: `code` state never resets on stage transition

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:34, 57`
**Issue:** If a user submits a wrong code, hits back, re-enters password, and re-enters the verify stage, the `code` state from the previous attempt is still present. Same for `error`. This is mostly cosmetic but the user might be confused why the OTP input shows their old (failed) digits.

**Fix:** On `setStage("verify")` transition, also `setCode("")` and `setError(null)`. Or split per IN-01 — then each stage is unmounted between transitions and resets naturally.

---

### IN-03: Description text lists specific authenticator brands

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:128`
**Issue:** `"Use Google Authenticator, 1Password, Authy, or similar."` — Authy was sunset for desktop in early 2024 and has rolled back several features on mobile. 1Password is fine. Google Authenticator is fine. Listing brands names this string subject to drift; if i18n is added, every locale has the same problem.

**Fix:** Generic phrasing: `"Use any TOTP-compatible authenticator app (Google Authenticator, 1Password, Microsoft Authenticator, Bitwarden, and others)."` Or move to i18n keys like the login flow already does (`useTranslations("auth.login.mfa")`) — the setup form is not i18n'd at all, while the sibling login-mfa form is. Inconsistent.

---

### IN-04: Trailing ellipsis "Starting…" / "Verifying…" use the Unicode character

**File:** `apps/web/app/auth/mfa/setup/mfa-setup-form.tsx:115, 175`
**Issue:** Stylistic — fine. Just noting that the rest of this codebase mixes `...` and `…` inconsistently; the login flow uses i18n strings where the choice is made once per locale. Once this form gets i18n (IN-03), this disappears.

**Fix:** No action required unless aligning with a project-wide style. If aligned with `login-mfa-form.tsx` via i18n, the question is moot.

---

## Notes on questions raised in the brief

For traceability:

1. **Secret handling:** Not logged. Stored in component state for the lifetime of the verify stage, never cleared on success (CR-03). Duplicated unnecessarily by `extractSecret` (CR-04).
2. **QR code generation:** Not generated at all (CR-02). Secret is rendered as raw text. SSR leak: NO, the page is a client component behind `<Suspense fallback={null}>`, the server payload does not include the secret. View-source on first paint is clean.
3. **Backup codes:** Returned by the server, discarded by the form, never shown to the user (CR-01). This is the single biggest defect.
4. **Confirmation step:** Server-side, `verifyTotp` is what actually flips `twoFactorEnabled=true` (better-auth/dist/plugins/two-factor/totp/index.mjs:144-153). The user MUST enter a valid code to activate 2FA. `skipVerificationOnEnable` is not passed in `packages/auth/src/server.ts`, so the safe default applies. Good.
5. **Replay:** Better Auth's `createOTP().verify(code)` (otp.mjs) handles TOTP window logic. The client does not allow resubmitting the same code in a way that would bypass the server's replay protection. Submit button is disabled while `submitting`. OK.
6. **CSRF:** Inherits from Better Auth's session cookie + same-origin checks via `trustedOrigins` in `packages/auth/src/server.ts:48`. No hand-rolled form posts. OK.
7. **Rate limiting:** Server-side only — Better Auth applies `window: 10s, max: 3` to all `/two-factor/*` paths (better-auth/dist/plugins/two-factor/index.mjs:269-275). The form does no client-side throttling. With WR-05 fixed (rejecting non-digit codes locally), wasted server requests drop substantially. Acceptable.
8. **UX safety:** Password field correctly uses `type="password"` and `autoComplete="current-password"` (line 102-103). TOTP uses `InputOTP` slots (not masked, which is correct for OTP — users need to see the digits they typed). Submit is disabled during pending state but the verify success path leaves it disabled forever on slow navigation (WR-02).
9. **Error messages:** Pass through `result.error.message` verbatim. Better Auth's messages are reasonably generic ("Invalid code", "Invalid password"). Risk: if BA's message ever embeds context like "secret expired" vs "code wrong" vs "session invalid", the form will propagate it unchanged and an attacker could potentially distinguish states. Low risk today, worth a unit test if BA changes.
10. **TypeScript:** No `any`. Controlled inputs throughout. ARIA: `role="alert"` is present but `aria-describedby` / `aria-invalid` missing (WR-04). Type assertion `as { totpURI?: string }` bypasses real types (WR-01).
11. **Simplification:** 190 lines because two stages share one component. Splitting drops each to ~80 (IN-01).

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
