import type { StepKey } from "@workspace/shared/auth"
import type { OnboardingRole } from "./role-types"

/**
 * Step lists per role. Both flows share the same step KEYS (so the
 * Zod schemas, action handlers, and form components are reused), but
 * member onboarding skips workspace/plan/team — they land in an
 * existing org instead of bootstrapping one.
 */
const OWNER_STEPS: readonly StepKey[] = [
  "profile",
  "experience",
  "password",
  "workspace",
  "plan",
  "team",
  "done",
] as const

const MEMBER_STEPS: readonly StepKey[] = [
  "profile",
  "experience",
  "password",
  "done",
] as const

export function stepsForRole(role: OnboardingRole): readonly StepKey[] {
  return role === "owner" ? OWNER_STEPS : MEMBER_STEPS
}

/**
 * Position of `step` in the role's flow (1-based). Returns -1 when
 * the step isn't part of this role's flow.
 */
export function stepIndexForRole(role: OnboardingRole, step: StepKey): number {
  const steps = stepsForRole(role)
  const idx = steps.indexOf(step)
  return idx === -1 ? -1 : idx + 1
}

export function totalStepsForRole(role: OnboardingRole): number {
  return stepsForRole(role).length
}

/**
 * Maps the next-incomplete step (owner-aware) onto the member's
 * allowed steps. Members never visit workspace/plan/team — if the
 * resolver lands on one of those, advance to "done".
 */
export function projectStepForRole(
  role: OnboardingRole,
  step: StepKey,
): StepKey {
  if (role === "owner") return step
  return MEMBER_STEPS.includes(step) ? step : "done"
}
