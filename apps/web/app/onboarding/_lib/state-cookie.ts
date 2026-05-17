import { cookies } from "next/headers"
import {
  signOnboardingStateToken,
  verifyOnboardingStateToken,
  type OnboardingStateClaims,
} from "@workspace/auth/tokens"

/**
 * Per-step state cookie for owner onboarding.
 *
 * Steps 1 (Profile) + 2 (Experience) collect data BEFORE the Better Auth
 * user is created (step 3). To avoid touching the database in those steps
 * — there's no app_user row yet — the inputs are stashed in this signed
 * HttpOnly cookie. Step 3 reads everything, creates the BA user, applies
 * the merged data to the new `app_user` row, then clears the cookie.
 *
 * Note: this reader intentionally does NOT consult the dev-preview cookie.
 * dev-preview relaxes auth-guards at the LAYOUT level (so designers can
 * render screens without a session); it must never fake "the user already
 * filled step 1+2", because that pollutes `decideNextStep` and routes
 * fresh signups straight to /password.
 */
export const ONBOARDING_STATE_COOKIE = "app-onboarding-state"
const COOKIE_PATH = "/"
const COOKIE_TTL_SECONDS = 60 * 60 * 24

type State = Omit<OnboardingStateClaims, "kind">

export async function readOnboardingState(): Promise<State> {
  const cookieStore = await cookies()
  const token = cookieStore.get(ONBOARDING_STATE_COOKIE)?.value
  if (!token) return {}
  try {
    const claims = await verifyOnboardingStateToken(token)
    const next: State = {}
    if (claims.profile) next.profile = claims.profile
    if (claims.experience) next.experience = claims.experience
    return next
  } catch {
    return {}
  }
}

export async function writeOnboardingState(partial: State): Promise<void> {
  const current = await readOnboardingState()
  const merged: State = { ...current, ...partial }
  const token = await signOnboardingStateToken(merged, COOKIE_TTL_SECONDS)
  const cookieStore = await cookies()
  cookieStore.set(ONBOARDING_STATE_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: COOKIE_PATH,
    maxAge: COOKIE_TTL_SECONDS,
  })
}

export async function clearOnboardingState(): Promise<void> {
  const cookieStore = await cookies()
  cookieStore.delete({ name: ONBOARDING_STATE_COOKIE, path: COOKIE_PATH })
}
