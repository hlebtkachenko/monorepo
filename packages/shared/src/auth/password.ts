import { z } from "zod"

/**
 * Password validation rules shown in the live checklist UI and enforced by the
 * server-side schema. Mirror order in the design (length, number, symbol,
 * mixed case). Each rule's `key` is the i18n message slug.
 */
export const PASSWORD_RULES = [
  {
    key: "length",
    test: (pw: string) => pw.length >= 12,
  },
  {
    key: "number",
    test: (pw: string) => /\d/.test(pw),
  },
  {
    key: "symbol",
    test: (pw: string) => /[^A-Za-z0-9]/.test(pw),
  },
  {
    key: "mixedCase",
    test: (pw: string) => /[a-z]/.test(pw) && /[A-Z]/.test(pw),
  },
] as const

export type PasswordRuleKey = (typeof PASSWORD_RULES)[number]["key"]

export const PasswordSchema = z
  .string()
  .min(12, { error: "password.length" })
  // Mirrors Better Auth's maxPasswordLength so over-long input fails at the
  // form boundary instead of as a late opaque BA endpoint error. Literal
  // message (not an i18n slug): form error renderers pass non-"password.*"
  // strings through verbatim.
  .max(128, { error: "Use at most 128 characters." })
  .refine((pw) => /\d/.test(pw), { error: "password.number" })
  .refine((pw) => /[^A-Za-z0-9]/.test(pw), { error: "password.symbol" })
  .refine((pw) => /[a-z]/.test(pw) && /[A-Z]/.test(pw), {
    error: "password.mixedCase",
  })

export function evaluatePassword(pw: string): Record<PasswordRuleKey, boolean> {
  return PASSWORD_RULES.reduce(
    (acc, rule) => {
      acc[rule.key] = rule.test(pw)
      return acc
    },
    {} as Record<PasswordRuleKey, boolean>,
  )
}
