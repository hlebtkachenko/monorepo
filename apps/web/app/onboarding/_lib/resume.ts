import "server-only"
import { eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { app_user, workspace, workspace_membership } from "@workspace/db/schema"

import { readOnboardingState } from "./state-cookie"

export type StepKey =
  | "profile"
  | "experience"
  | "password"
  | "workspace"
  | "plan"
  | "team"
  | "done"

export const STEP_ORDER: readonly StepKey[] = [
  "profile",
  "experience",
  "password",
  "workspace",
  "plan",
  "team",
  "done",
] as const

export const TOTAL_STEPS = STEP_ORDER.length

export function stepIndex(step: StepKey): number {
  return STEP_ORDER.indexOf(step) + 1
}

export function stepPath(step: StepKey): string {
  return `/onboarding/${step}`
}

/**
 * Compute the next-incomplete step for a user, given:
 *   - the onboarding-state cookie (steps 1-2 before BA user exists),
 *   - the app_user row (profile_completed_at, experience),
 *   - the user's owner workspace row (step_*_completed_at timestamps).
 *
 * Caller MUST pass `userId` when a Better Auth session exists; pass
 * `null` for pre-account-creation visitors (steps 1-2 walk the cookie).
 */
export async function resolveNextStep(userId: string | null): Promise<StepKey> {
  if (!userId) {
    const state = await readOnboardingState()
    if (!state.profile) return "profile"
    if (!state.experience) return "experience"
    return "password"
  }

  return await withAdminBypass(async (db) => {
    const userRow = (
      await db
        .select({
          profileCompletedAt: app_user.profile_completed_at,
          experience: app_user.experience,
        })
        .from(app_user)
        .where(eq(app_user.id, userId))
        .limit(1)
    )[0]

    if (!userRow) return "profile"
    if (!userRow.profileCompletedAt) return "profile"
    if (!userRow.experience) return "experience"

    const wsRow = (
      await db
        .select({
          step1: workspace.step_1_completed_at,
          step2: workspace.step_2_completed_at,
          step3: workspace.step_3_completed_at,
          step4: workspace.step_4_completed_at,
        })
        .from(workspace)
        .innerJoin(
          workspace_membership,
          eq(workspace_membership.workspace_id, workspace.id),
        )
        .where(eq(workspace_membership.user_id, userId))
        .orderBy(workspace.created_at)
        .limit(1)
    )[0]

    if (!wsRow) return "workspace"
    if (!wsRow.step1) return "workspace"
    if (!wsRow.step2) return "plan"
    if (!wsRow.step3) return "team"
    if (!wsRow.step4) return "done"
    return "done"
  })
}

/** Looks up the owner workspace id for the given user. */
export async function findOwnerWorkspaceId(
  userId: string,
): Promise<string | null> {
  return await withAdminBypass(async (db) => {
    const row = (
      await db
        .select({ workspaceId: workspace_membership.workspace_id })
        .from(workspace_membership)
        .where(eq(workspace_membership.user_id, userId))
        .limit(1)
    )[0]
    return row?.workspaceId ?? null
  })
}
