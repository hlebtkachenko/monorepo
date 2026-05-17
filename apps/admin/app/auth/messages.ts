/**
 * English copy for the `@workspace/shared/auth` Zod schema error keys.
 *
 * The shared schemas emit i18n message slugs (`email.invalid`, …) because the
 * web app resolves them through `next-intl`. Admin is English-only and has no
 * `next-intl`, so it maps the handful of keys it actually uses here.
 */
const MESSAGES: Record<string, string> = {
  "email.required": "Email is required",
  "email.invalid": "Enter a valid email address",
  "password.required": "Password is required",
  "password.length": "Password must be at least 12 characters",
  "password.number": "Password must contain a number",
  "password.symbol": "Password must contain a symbol",
  "password.mixedCase": "Password must contain upper and lower case letters",
  "password.mismatch": "Passwords do not match",
  "otp.format": "Enter the 6-digit code",
  "token.required": "Reset token is missing",
}

/** Resolve a schema error key to English copy; passes through unknown keys. */
export function authMessage(key: string | undefined): string | undefined {
  if (!key) return undefined
  return MESSAGES[key] ?? key
}
