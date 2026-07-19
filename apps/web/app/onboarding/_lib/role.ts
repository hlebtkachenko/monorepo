import "server-only"

import { isDevPreview } from "@/lib/dev-preview"

import { readInviteClaims } from "@/lib/auth/invite-cookie"
import { readSignupClaims } from "@/lib/auth/signup-cookie"
import type { OnboardingRole } from "./role-types"

export interface OnboardingRoleContext {
  role: OnboardingRole
  email: string
}

/**
 * Onboarding role detection. The two onboarding flows (owner vs member)
 * are distinguished by which auth-token cookie minted the session:
 *
 *   __Host-afkey-sig + app-signup-payload  → owner flow (7 steps:
 *      profile, experience, password, workspace, plan, team, done)
 *   __Host-afkey-inv + app-invite-payload  → member flow (4 steps:
 *      profile, experience, password, done)
 *
 * The cookies are set by `/auth/<flow>/consume`, never on the GET
 * welcome route — that route's only job is to render the prefetch
 * defense form for human submission.
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
