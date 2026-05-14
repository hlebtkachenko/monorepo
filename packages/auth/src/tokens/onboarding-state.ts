import { signToken, verifyToken } from "./jwt"

/**
 * Onboarding-state token — carries owner-onboarding step data collected
 * BEFORE the Better Auth user is created (steps 1 + 2: profile +
 * experience). The flow:
 *
 *   step 1 → server action serializes ProfileInput, signs it as
 *   `onboarding-state`, sets the cookie
 *   step 2 → server action reads, merges ExperienceInput, re-signs
 *   step 3 → password action reads, creates the BA user via
 *   `auth.api.signUpEmail`, then writes the merged profile + experience
 *   to the new `app_user` row and clears the cookie
 *
 * After step 3 the BA session is the authority; steps 4-7 write directly.
 *
 * Default TTL: 1 day. Long enough for a user to take a break between
 * steps, short enough to bound exposure if the cookie ever leaks. Cookie
 * is HttpOnly, signed (HS256), and path-scoped to `/onboarding`.
 *
 * Schema is intentionally a free-form record: each step contributes its
 * own slice, and downstream validation runs the appropriate Zod schema
 * before the data hits the database.
 */
export interface OnboardingStateClaims {
  kind: "onboarding-state"
  /** ISO-form data captured by step 1 (Profile). */
  profile?: {
    firstName: string
    lastName: string
    phone?: string
    locale: string
    timezone: string
  }
  /** Single-enum slice captured by step 2 (Experience). */
  experience?: "new" | "some" | "bookkeeper" | "accountant"
}

const DEFAULT_TTL_SECONDS = 60 * 60 * 24

export async function signOnboardingStateToken(
  state: Omit<OnboardingStateClaims, "kind">,
  ttlSeconds: number = DEFAULT_TTL_SECONDS,
): Promise<string> {
  return await signToken<OnboardingStateClaims>(
    { kind: "onboarding-state", ...state },
    ttlSeconds,
  )
}

export async function verifyOnboardingStateToken(
  token: string,
): Promise<OnboardingStateClaims> {
  return await verifyToken<OnboardingStateClaims>(token, "onboarding-state")
}
