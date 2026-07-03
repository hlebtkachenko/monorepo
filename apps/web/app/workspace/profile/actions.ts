"use server"

import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { z } from "zod"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"

import { type ActionResult } from "../../../lib/action-result"
import { logServerError } from "../../../lib/log-server-error"

export type { ActionResult }

const DisplayNameSchema = z.object({
  displayName: z
    .string()
    .min(1, { error: "displayName.required" })
    .max(100, { error: "displayName.tooLong" })
    .trim(),
})
export type DisplayNameInput = z.infer<typeof DisplayNameSchema>

/**
 * Save the signed-in user's display name — writes both `app_user.name` and
 * `app_user.display_name` to the same value, mirroring how
 * `submitProfileAction` (onboarding) sets both columns together. Identity is
 * re-derived from the session server-side; the client never supplies a user
 * id. `withAdminBypass` + explicit `eq(app_user.id, ...)` predicate, same
 * pattern as every other workspace-tier write in this tier.
 */
export async function saveDisplayNameAction(
  input: DisplayNameInput,
): Promise<ActionResult> {
  const parsed = DisplayNameSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: "invalidInput" }
  }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(app_user)
        .set({
          name: parsed.data.displayName,
          display_name: parsed.data.displayName,
          updated_at: new Date(),
        })
        .where(eq(app_user.id, session.user.id))
    })
  } catch (err) {
    logServerError("workspace/profile display name save failed", err)
    return { ok: false, errorKey: "saveDisplayNameFailed" }
  }

  return { ok: true }
}
