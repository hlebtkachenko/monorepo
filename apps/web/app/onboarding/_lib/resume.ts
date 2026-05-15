import "server-only"
import { and, eq } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db"
import { app_user, workspace, workspace_membership } from "@workspace/db/schema"

import {
  decideNextStep,
  stepPath,
  STEP_ORDER,
  type StepKey,
} from "@workspace/shared/auth"

import { readActiveWorkspaceCookie } from "./active-workspace-cookie"
import { readOnboardingState } from "./state-cookie"

export {
  decideNextStep,
  stepIndex,
  stepPath,
  STEP_ORDER,
  TOTAL_STEPS,
  type StepKey,
} from "@workspace/shared/auth"

/**
 * Compute the next-incomplete step for a user.
 *
 * Wraps the pure `decideNextStep` resolver with a DB + cookie snapshot:
 *   - the onboarding-state cookie (steps 1-2 before BA user exists)
 *   - the app_user row (profile_completed_at, experience)
 *   - the user's owner workspace row (step_*_completed_at)
 *
 * The owner workspace lookup is preceded by a check of the
 * `app-active-workspace` cookie. The cookie is set after step 4
 * succeeds, so once it's present, the resolver targets THAT workspace
 * directly instead of "first owner workspace ordered by created_at"
 * (which is wrong for multi-workspace owners).
 */
export async function resolveNextStep(userId: string | null): Promise<StepKey> {
  if (!userId) {
    const state = await readOnboardingState()
    return decideNextStep({
      hasSession: false,
      cookieHasProfile: !!state.profile,
      cookieHasExperience: !!state.experience,
      profileCompletedAt: null,
      experience: null,
      workspaceExists: false,
      step1CompletedAt: null,
      step2CompletedAt: null,
      step3CompletedAt: null,
      step4CompletedAt: null,
    })
  }

  const activeWorkspaceId = await readActiveWorkspaceCookie()

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

    let wsRow:
      | {
          step1: Date | null
          step2: Date | null
          step3: Date | null
          step4: Date | null
        }
      | undefined

    if (activeWorkspaceId) {
      const row = (
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
          .where(
            and(
              eq(workspace.id, activeWorkspaceId),
              eq(workspace_membership.user_id, userId),
              eq(workspace_membership.role, "owner"),
              eq(workspace_membership.active, true),
            ),
          )
          .limit(1)
      )[0]
      if (row) wsRow = row
    }

    if (!wsRow) {
      wsRow = (
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
          .where(
            and(
              eq(workspace_membership.user_id, userId),
              eq(workspace_membership.role, "owner"),
              eq(workspace_membership.active, true),
            ),
          )
          .orderBy(workspace.created_at)
          .limit(1)
      )[0]
    }

    return decideNextStep({
      hasSession: true,
      cookieHasProfile: false,
      cookieHasExperience: false,
      profileCompletedAt: userRow?.profileCompletedAt ?? null,
      experience: userRow?.experience ?? null,
      workspaceExists: !!wsRow,
      step1CompletedAt: wsRow?.step1 ?? null,
      step2CompletedAt: wsRow?.step2 ?? null,
      step3CompletedAt: wsRow?.step3 ?? null,
      step4CompletedAt: wsRow?.step4 ?? null,
    })
  })
}

/**
 * Server-side guard for owner-onboarding step pages 4-7. Lets the user
 * visit any step at-or-before their next-incomplete step, but blocks
 * forward-skipping. This is what enables the "Back" link in the shell —
 * navigating back to /onboarding/plan from /onboarding/team must NOT
 * redirect forward to /team again. Done-page can opt out of the
 * "redirect if next==done" guard with `allowOnDone: true`.
 */
export async function assertOwnerOnStep(
  userId: string,
  expected: StepKey,
  options: { allowOnDone?: boolean } = {},
): Promise<void> {
  const { redirect } = await import("next/navigation")
  const next = await resolveNextStep(userId)
  if (next === expected) return
  if (options.allowOnDone && next === "done") return
  const expectedIdx = STEP_ORDER.indexOf(expected)
  const nextIdx = STEP_ORDER.indexOf(next)
  // Revisiting an already-completed step is allowed; only skipping
  // forward redirects to the canonical next step.
  if (expectedIdx !== -1 && nextIdx !== -1 && expectedIdx < nextIdx) return
  redirect(stepPath(next))
}

/**
 * Look up the owner workspace id for the given user. Prefers the
 * active-workspace cookie when set; falls back to "first owner
 * workspace by created_at" otherwise. Used by post-step-3 actions
 * that need to write to "the user's workspace" before the cookie is
 * established (step 4 sets the cookie at the end of its action).
 */
export async function findOwnerWorkspaceId(
  userId: string,
): Promise<string | null> {
  const activeWorkspaceId = await readActiveWorkspaceCookie()
  if (activeWorkspaceId) {
    // Defense-in-depth: stale cookie shouldn't grant writes to a
    // workspace the user no longer owns. Verify ownership before
    // trusting the cookie's value.
    const verified = await withAdminBypass(async (db) => {
      const [row] = await db
        .select({ id: workspace_membership.workspace_id })
        .from(workspace_membership)
        .where(
          and(
            eq(workspace_membership.workspace_id, activeWorkspaceId),
            eq(workspace_membership.user_id, userId),
            eq(workspace_membership.role, "owner"),
            eq(workspace_membership.active, true),
          ),
        )
        .limit(1)
      return row?.id ?? null
    })
    if (verified) return verified
  }

  return await withAdminBypass(async (db) => {
    const row = (
      await db
        .select({ workspaceId: workspace_membership.workspace_id })
        .from(workspace_membership)
        .innerJoin(
          workspace,
          eq(workspace.id, workspace_membership.workspace_id),
        )
        .where(
          and(
            eq(workspace_membership.user_id, userId),
            eq(workspace_membership.role, "owner"),
            eq(workspace_membership.active, true),
          ),
        )
        .orderBy(workspace.created_at)
        .limit(1)
    )[0]
    return row?.workspaceId ?? null
  })
}
