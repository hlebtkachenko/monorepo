"use server"

import { revalidatePath } from "next/cache"
import { asc, eq, sql } from "drizzle-orm"
import { z } from "zod"

import { withAdminBypass } from "@workspace/db"
import { feature_flag } from "@workspace/db/schema"

import { auditAdminAction } from "@/lib/admin-audit"
import { requireAdminCapability } from "@/lib/admin-capability"
import { isKillSwitchFlag } from "@/lib/capabilities"
import { requireStepUpForAction } from "@/lib/step-up"

/**
 * Shared `feature_flag` actions. The dedicated feature-flags admin page was
 * retired, but the kill-switch + maintenance toggles (Ops) and the command
 * palette still flip flags, so the two read/toggle actions live here.
 */

export type ActionResult = { ok: true } | { ok: false; error: string }

function revalidateFlagPaths(): void {
  revalidatePath("/ops/kill-switches")
  revalidatePath("/ops/maintenance")
}

const FlagKey = z
  .string()
  .min(1)
  .max(200)
  .regex(
    /^[a-z0-9]+(?:[._-][a-z0-9]+)*$/,
    "key must be dotted-lowercase (e.g. lago.resolver.enabled)",
  )

const ToggleInput = z.object({
  key: FlagKey,
  enabled: z.boolean(),
  /** Where to bounce back to after step-up; defaults to the kill-switch page. */
  returnPath: z.string().optional(),
})

export async function toggleFeatureFlag(
  rawInput: z.infer<typeof ToggleInput>,
): Promise<ActionResult> {
  try {
    await requireAdminCapability("admin:flag.write")
    const input = ToggleInput.parse(rawInput)
    // Kill-switch flags (maintenance/emergency/auth-disable) require fresh
    // TOTP before flipping — flat permission is not enough.
    if (isKillSwitchFlag(input.key)) {
      await requireStepUpForAction(
        "flag.kill_switch",
        input.returnPath ?? "/ops/kill-switches",
      )
    }
    await withAdminBypass(async (db) => {
      await db
        .update(feature_flag)
        .set({ enabled: input.enabled, updated_at: sql`now()` })
        .where(eq(feature_flag.key, input.key))
    })
    await auditAdminAction({
      action: "admin.ops.flag_toggled",
      payload: { key: input.key, enabled: input.enabled },
    })
    revalidateFlagPaths()
    return { ok: true }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}

export type ListFlagsResult =
  | { ok: true; flags: Array<{ key: string; enabled: boolean }> }
  | { ok: false; error: string }

export async function listFeatureFlagsForCommand(): Promise<ListFlagsResult> {
  try {
    await requireAdminCapability("admin:read")
    const rows = await withAdminBypass((db) =>
      db
        .select({ key: feature_flag.key, enabled: feature_flag.enabled })
        .from(feature_flag)
        .orderBy(asc(feature_flag.key))
        .limit(200),
    )
    return { ok: true, flags: rows }
  } catch (err) {
    return { ok: false, error: (err as Error).message }
  }
}
