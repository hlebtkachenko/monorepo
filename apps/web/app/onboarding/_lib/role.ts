import "server-only"

import { isDevPreview } from "@/lib/dev-preview"

import { readInviteClaims } from "./invite-cookie"
import { readSignupClaims } from "./signup-cookie"
import type { OnboardingRole } from "./role-types"

export type { OnboardingRole } from "./role-types"

export interface OnboardingRoleContext {
  role: OnboardingRole
  email: string
}

/**
 * Onboarding role detection. The two onboarding flows (owner vs member)
 * are distinguished by which cookie minted the session:
 *
 *   - `app-signup-token` → owner flow (7 steps: profile, experience,
 *     password, workspace, plan, team, done)
 *   - `app-invite-token` → member flow (4 steps: profile, experience,
 *     password, done)
 *
 * The cookie is set at the entry route (`/auth/signup/start` or
 * `/auth/invite/start`) before the user lands on `/onboarding/*`.
 *
 * If both cookies are present (edge case: a user with a pending invite
 * also started signup), the invite wins because the invite carries
 * stronger intent (a specific org membership) than a generic signup.
 */
export async function detectOnboardingRole(): Promise<OnboardingRoleContext | null> {
  const invite = await readInviteClaims()
  if (invite) return { role: "member", email: invite.email }
  const signup = await readSignupClaims()
  if (signup) return { role: "owner", email: signup.email }
  if (await isDevPreview()) {
    return { role: "owner", email: "preview@example.com" }
  }
  return null
}
