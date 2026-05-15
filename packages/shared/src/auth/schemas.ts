import { z } from "zod"
import { PasswordSchema } from "./password"

/** Step 1 of two-step login — email only. */
export const LoginEmailSchema = z.object({
  email: z
    .string()
    .min(1, { error: "email.required" })
    .email({ error: "email.invalid" })
    .max(320),
})
export type LoginEmailInput = z.infer<typeof LoginEmailSchema>

/** Step 2 of two-step login — password + remember-me. Email is from cookie. */
export const LoginPasswordSchema = z.object({
  password: z.string().min(1, { error: "password.required" }),
  rememberMe: z.boolean(),
})
export type LoginPasswordInput = z.infer<typeof LoginPasswordSchema>

/** Step 3 of two-step login — TOTP code. */
export const OTPSchema = z.object({
  code: z.string().regex(/^\d{6}$/, { error: "otp.format" }),
})
export type OTPInput = z.infer<typeof OTPSchema>

/** Forgot-password — request reset link. */
export const ForgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, { error: "email.required" })
    .email({ error: "email.invalid" })
    .max(320),
})
export type ForgotPasswordInput = z.infer<typeof ForgotPasswordSchema>

/** Reset-password — set new password from email-link token. */
export const ResetPasswordSchema = z
  .object({
    token: z.string().min(1, { error: "token.required" }),
    password: PasswordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    error: "password.mismatch",
    path: ["confirm"],
  })
export type ResetPasswordInput = z.infer<typeof ResetPasswordSchema>
