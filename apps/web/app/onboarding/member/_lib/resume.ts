export type MemberStepKey = "profile" | "experience" | "password" | "done"

export const MEMBER_STEP_ORDER: readonly MemberStepKey[] = [
  "profile",
  "experience",
  "password",
  "done",
] as const

export const MEMBER_TOTAL_STEPS = MEMBER_STEP_ORDER.length

export function memberStepIndex(step: MemberStepKey): number {
  return MEMBER_STEP_ORDER.indexOf(step) + 1
}

export function memberStepPath(step: MemberStepKey): string {
  return `/onboarding/member/${step}`
}
