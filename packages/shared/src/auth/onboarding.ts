import { z } from "zod"
import { PasswordSchema } from "./password"

/** Step 1 — profile. Avatar uploaded separately (multipart). */
export const ProfileSchema = z.object({
  firstName: z
    .string()
    .min(1, { error: "name.required" })
    .max(100, { error: "name.tooLong" })
    .trim(),
  lastName: z
    .string()
    .min(1, { error: "name.required" })
    .max(100, { error: "name.tooLong" })
    .trim(),
  // Must match the `app_user_phone_format` DB CHECK constraint
  // (E.164: ^\+[1-9][0-9]{7,14}$). Empty string passes — the server action
  // coerces empty to NULL before INSERT/UPDATE.
  phone: z
    .string()
    .max(32, { error: "phone.tooLong" })
    .regex(/^\+[1-9][0-9]{7,14}$/, { error: "phone.format" })
    .optional()
    .or(z.literal("")),
  locale: z.string().min(2).max(10),
  timezone: z.string().min(1).max(64),
})
export type ProfileInput = z.infer<typeof ProfileSchema>

/** Step 2 — experience level. Mirrors DB enum app_user_experience. */
export const ExperienceSchema = z.object({
  experience: z.enum(["new", "some", "bookkeeper", "accountant"]),
})
export type ExperienceInput = z.infer<typeof ExperienceSchema>

/** Step 3 — password (also reused by member onboarding step 3). */
export const OnboardingPasswordSchema = z
  .object({
    password: PasswordSchema,
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    error: "password.mismatch",
    path: ["confirm"],
  })
export type OnboardingPasswordInput = z.infer<typeof OnboardingPasswordSchema>

/** Step 4 — workspace. Mirrors DB enums workspace_use_case + workspace_team_size. */
export const WorkspaceSchema = z.object({
  displayName: z
    .string()
    .min(1, { error: "workspace.required" })
    .max(100, { error: "workspace.tooLong" })
    .trim(),
  useCase: z.enum(["firm", "biz"]),
  teamSize: z.enum(["solo", "sm", "md", "lg", "xl"]),
})
export type WorkspaceInput = z.infer<typeof WorkspaceSchema>

/** Step 5 — plan. Mirrors DB enum billing_plan. */
export const PlanSchema = z.object({
  plan: z.enum(["starter", "growth", "scale"]),
})
export type PlanInput = z.infer<typeof PlanSchema>

/** Step 6 — invite team. Empty list allowed (Skip for now). */
export const InviteRowSchema = z.object({
  // Normalise email at the validation boundary: trim + lowercase so the
  // (organization, email) uniqueness in auth_invite resolves
  // case-insensitively without relying solely on the DB trigger.
  email: z
    .string()
    .max(320)
    .transform((s) => s.trim().toLowerCase())
    .pipe(z.string().email({ error: "email.invalid" }).or(z.literal(""))),
  role: z.enum(["admin", "member"]),
})
export type InviteRowInput = z.infer<typeof InviteRowSchema>

export const InviteListSchema = z.object({
  invites: z
    .array(InviteRowSchema)
    .max(50, { error: "invites.tooMany" })
    .transform((rows) => rows.filter((r) => r.email !== "")),
})
export type InviteListInput = z.infer<typeof InviteListSchema>
