/**
 * Pure step resolver — the decision tree that picks the next-incomplete
 * onboarding step from a user's persisted state. Lives in
 * `@workspace/shared/auth` so both the apps/web wrapper (`resume.ts`)
 * and the DB tests (`packages/db/tests/onboarding-step-resolver.test.ts`)
 * can import it without crossing the app boundary.
 *
 * The runtime wrapper queries the DB + cookie state, then hands the
 * snapshot to `decideNextStep`.
 */

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
 * Snapshot of the persisted state that determines the next step.
 * `profileCompletedAt`/`experience` come from `app_user`. The
 * workspace timestamps come from the user's owner workspace row.
 *
 * `workspaceExists` distinguishes "user finished step 3 (BA account
 * exists) but step 4 hasn't run yet" (no workspace row) from "user
 * is on step 4 but partway through" (workspace row exists,
 * step_1_completed_at not yet set).
 */
export interface ResolverSnapshot {
  hasSession: boolean
  cookieHasProfile: boolean
  cookieHasExperience: boolean
  profileCompletedAt: Date | null
  experience: string | null
  workspaceExists: boolean
  step1CompletedAt: Date | null
  step2CompletedAt: Date | null
  step3CompletedAt: Date | null
  step4CompletedAt: Date | null
}

export function decideNextStep(snap: ResolverSnapshot): StepKey {
  // Pre-account-creation: BA user doesn't exist yet, the cookie carries
  // the partial state from steps 1+2.
  if (!snap.hasSession) {
    if (!snap.cookieHasProfile) return "profile"
    if (!snap.cookieHasExperience) return "experience"
    return "password"
  }

  // Post-account-creation: the BA user exists. Honor whatever is
  // persisted in the DB.
  if (!snap.profileCompletedAt) return "profile"
  if (!snap.experience) return "experience"

  // Step 4 — workspace row may or may not exist yet.
  if (!snap.workspaceExists) return "workspace"
  if (!snap.step1CompletedAt) return "workspace"
  if (!snap.step2CompletedAt) return "plan"
  if (!snap.step3CompletedAt) return "team"
  if (!snap.step4CompletedAt) return "done"
  return "done"
}
