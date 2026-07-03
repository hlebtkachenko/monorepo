"use server"

import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { workspace } from "@workspace/db/schema"

import { type ActionResult } from "../../../lib/action-result"
import { logServerError } from "../../../lib/log-server-error"
import { getWorkspaceContext } from "../_lib/workspace-context"

export type { ActionResult }

const SettingsSchema = z.object({
  displayName: z
    .string()
    .min(1, { error: "displayName.required" })
    .max(100, { error: "displayName.tooLong" })
    .trim(),
  purpose: z.string().max(2000, { error: "purpose.tooLong" }),
  contactEmail: z
    .string()
    .max(320, { error: "contactEmail.tooLong" })
    .email({ error: "contactEmail.invalid" })
    .or(z.literal("")),
  contactPhone: z.string().max(20, { error: "contactPhone.tooLong" }),
  website: z.string().max(2048, { error: "website.tooLong" }),
})
export type SettingsInput = z.infer<typeof SettingsSchema>

/**
 * Save the workspace (firm) settings — `workspace.display_name/purpose/
 * contact_email/contact_phone/website`. Identity is re-derived from the
 * session server-side; the client never supplies the workspace id.
 * `withAdminBypass` + explicit `eq(workspace.id, ...)` predicate, same trap
 * as the read in `page.tsx` — `withWorkspace` would clear
 * `app.organization_id` and is not needed for a workspace-scoped write.
 */
export async function saveWorkspaceSettingsAction(
  input: SettingsInput,
): Promise<ActionResult> {
  const parsed = SettingsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: "invalidInput" }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }

  const ctx = await getWorkspaceContext(session.user.id)
  if (!ctx.activeWorkspaceId) {
    return { ok: false, errorKey: "noActiveWorkspace" }
  }
  const workspaceId = ctx.activeWorkspaceId

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(workspace)
        .set({
          display_name: parsed.data.displayName,
          purpose: parsed.data.purpose || null,
          contact_email: parsed.data.contactEmail || null,
          contact_phone: parsed.data.contactPhone || null,
          website: parsed.data.website || null,
          updated_at: new Date(),
        })
        .where(eq(workspace.id, workspaceId))
    })
  } catch (err) {
    logServerError("workspace/settings save failed", err)
    return { ok: false, errorKey: "saveSettingsFailed" }
  }

  return { ok: true }
}
