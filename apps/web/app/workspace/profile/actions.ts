"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { and, eq, isNull, sql } from "drizzle-orm"
import { z } from "zod"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { api_key, app_user, audit_event } from "@workspace/db/schema"

import { type ActionResult } from "../../../lib/action-result"
import { logServerError } from "../../../lib/log-server-error"
import { getWorkspaceContext } from "../_lib/workspace-context"

const ProfileSchema = z.object({
  titlePrefix: z.string().max(40).trim(),
  givenName: z.string().max(100).trim(),
  familyName: z.string().max(100).trim(),
  titleSuffix: z.string().max(40).trim(),
  displayName: z
    .string()
    .min(1, { error: "displayName.required" })
    .max(100, { error: "displayName.tooLong" })
    .trim(),
  phone: z.string().max(64, { error: "phone.tooLong" }).trim(),
  jobTitle: z.string().max(120).trim(),
  department: z.string().max(120).trim(),
})
export type ProfileInput = z.infer<typeof ProfileSchema>

const ProfileAppearanceSchema = z.object({
  locale: z.enum(["en", "cs"]),
  theme: z.enum(["system", "light", "dark"]),
  iconStyle: z.enum(["lucide", "phosphor", "fontawesome"]),
  timezone: z.string().min(1).max(64).trim(),
  dateFormat: z.enum(["DD/MM/YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]),
  timeFormat: z.enum(["24-hour", "12-hour"]),
})
export type ProfileAppearanceInput = z.infer<typeof ProfileAppearanceSchema>

const ProfilePrivacySchema = z.object({
  marketingConsent: z.boolean(),
  productUpdatesConsent: z.boolean(),
})
export type ProfilePrivacyInput = z.infer<typeof ProfilePrivacySchema>

const SignaturePathsSchema = z
  .array(
    z
      .string()
      .max(10_000)
      .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE+.,\-\s]+$/),
  )
  .max(100)
  .refine((paths) => paths.join("").length <= 50_000)

/**
 * Save signed-in user profile details. Identity is re-derived from the session
 * server-side; the client never supplies a user id.
 */
export async function saveProfileAction(
  input: ProfileInput,
): Promise<ActionResult> {
  const parsed = ProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: "invalidInput" }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }
  const context = await getWorkspaceContext(session.user.id)

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(app_user)
        .set({
          name:
            `${parsed.data.givenName} ${parsed.data.familyName}`.trim() ||
            parsed.data.displayName,
          display_name: parsed.data.displayName,
          title_prefix: parsed.data.titlePrefix || null,
          given_name: parsed.data.givenName,
          family_name: parsed.data.familyName,
          title_suffix: parsed.data.titleSuffix || null,
          phone: parsed.data.phone || null,
          job_title: parsed.data.jobTitle || null,
          department: parsed.data.department || null,
          updated_at: new Date(),
        })
        .where(eq(app_user.id, session.user.id))
      await db.insert(audit_event).values({
        workspace_id: context.activeWorkspaceId,
        actor_user_id: session.user.id,
        action: "profile.updated",
        payload: {
          fields: ["identity", "phone", "company_structure"],
        },
      })
    })
  } catch (err) {
    logServerError("workspace/profile save failed", err)
    return { ok: false, errorKey: "saveProfileFailed" }
  }

  return { ok: true }
}

export async function saveProfileAppearanceAction(
  input: ProfileAppearanceInput,
): Promise<ActionResult> {
  const parsed = ProfileAppearanceSchema.safeParse(input)
  if (!parsed.success) return { ok: false, errorKey: "invalidInput" }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }
  const context = await getWorkspaceContext(session.user.id)

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(app_user)
        .set({
          locale: parsed.data.locale,
          theme: parsed.data.theme,
          icon_style: parsed.data.iconStyle,
          timezone: parsed.data.timezone,
          date_format: parsed.data.dateFormat,
          time_format: parsed.data.timeFormat,
          updated_at: new Date(),
        })
        .where(eq(app_user.id, session.user.id))
      await db.insert(audit_event).values({
        workspace_id: context.activeWorkspaceId,
        actor_user_id: session.user.id,
        action: "profile.appearance_updated",
        payload: {
          fields: ["customization", "regional_preferences"],
        },
      })
    })
  } catch (err) {
    logServerError("workspace/profile appearance save failed", err)
    return { ok: false, errorKey: "saveProfileFailed" }
  }

  return { ok: true }
}

export async function saveProfilePrivacyAction(
  input: ProfilePrivacyInput,
): Promise<ActionResult> {
  const parsed = ProfilePrivacySchema.safeParse(input)
  if (!parsed.success) return { ok: false, errorKey: "invalidInput" }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }
  const context = await getWorkspaceContext(session.user.id)

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(app_user)
        .set({
          marketing_consent: parsed.data.marketingConsent,
          product_updates_consent: parsed.data.productUpdatesConsent,
          updated_at: new Date(),
        })
        .where(eq(app_user.id, session.user.id))
      await db.insert(audit_event).values({
        workspace_id: context.activeWorkspaceId,
        actor_user_id: session.user.id,
        action: "profile.privacy_updated",
        payload: { fields: ["communication_consent"] },
      })
    })
  } catch (err) {
    logServerError("workspace/profile privacy save failed", err)
    return { ok: false, errorKey: "saveProfileFailed" }
  }

  return { ok: true }
}

export async function saveProfileSignatureAction(
  paths: string[],
): Promise<ActionResult> {
  const parsed = SignaturePathsSchema.safeParse(paths)
  if (!parsed.success) return { ok: false, errorKey: "invalidInput" }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }
  const context = await getWorkspaceContext(session.user.id)

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(app_user)
        .set({
          signature_data:
            parsed.data.length > 0 ? JSON.stringify(parsed.data) : null,
          updated_at: new Date(),
        })
        .where(eq(app_user.id, session.user.id))
      await db.insert(audit_event).values({
        workspace_id: context.activeWorkspaceId,
        actor_user_id: session.user.id,
        action:
          parsed.data.length > 0
            ? "profile.signature_updated"
            : "profile.signature_removed",
        payload: {},
      })
    })
  } catch (err) {
    logServerError("workspace/profile signature save failed", err)
    return { ok: false, errorKey: "saveProfileFailed" }
  }

  return { ok: true }
}

export async function revokeOwnApiKeyAction(
  apiKeyId: string,
): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(apiKeyId)
  if (!parsed.success) return { ok: false, errorKey: "invalidInput" }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }

  try {
    const revoked = await withAdminBypass(async (db) => {
      const rows = await db
        .update(api_key)
        .set({ revoked_at: sql`now()`, updated_at: sql`now()` })
        .where(
          and(
            eq(api_key.id, parsed.data),
            eq(api_key.created_by_user_id, session.user.id),
            isNull(api_key.revoked_at),
          ),
        )
        .returning({
          id: api_key.id,
          workspaceId: api_key.workspace_id,
          organizationId: api_key.organization_id,
        })
      const key = rows[0]
      if (!key) return false
      await db.insert(audit_event).values({
        workspace_id: key.workspaceId,
        organization_id: key.organizationId,
        actor_user_id: session.user.id,
        action: "profile.api_key_revoked",
        payload: { api_key_id: key.id },
      })
      return true
    })
    if (!revoked) return { ok: false, errorKey: "apiKeyNotFound" }
  } catch (err) {
    logServerError("workspace/profile API key revoke failed", err)
    return { ok: false, errorKey: "revokeApiKeyFailed" }
  }

  revalidatePath("/workspace/profile/security")
  return { ok: true }
}
