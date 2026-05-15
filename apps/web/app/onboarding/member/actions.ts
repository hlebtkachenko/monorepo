"use server"

import { headers } from "next/headers"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user } from "@workspace/db/schema"
import {
  OnboardingPasswordSchema,
  type OnboardingPasswordInput,
} from "@workspace/shared/auth"

import { isEmailAlreadyRegistered } from "../../auth/_lib/email-error"
import { materializeInvite } from "../../auth/_lib/materialize-invite"
import { readOnboardingState, clearOnboardingState } from "../_lib/state-cookie"
import {
  clearInviteCookie,
  readInviteClaims,
  readRawInviteToken,
} from "./_lib/invite-cookie"

export interface MemberPasswordResult {
  ok: boolean
  errorKey?: string
  /** Slug of the organization the new member just joined. */
  orgSlug?: string
}

/**
 * Step 3 — creates the BA user (autoSignIn on the BA side), applies the
 * cookie-stashed profile + experience to the new app_user row, then
 * materializes the invite (workspace + organization membership +
 * accepted auth_invite audit row). Returns the org slug so the client
 * redirects to /[orgSlug].
 *
 * Idempotent across double-clicks and refreshes: if a session already
 * exists (i.e. the BA user was already created in an earlier attempt),
 * the action skips re-creating the account and only runs the profile
 * UPDATE + invite materialization tail.
 */
export async function submitMemberPasswordAction(
  input: OnboardingPasswordInput,
): Promise<MemberPasswordResult> {
  const parsed = OnboardingPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      errorKey: parsed.error.issues[0]?.message ?? "invalid",
    }
  }

  const claims = await readInviteClaims()
  if (!claims) {
    return { ok: false, errorKey: "sessionExpired" }
  }
  const state = await readOnboardingState()
  if (!state.profile || !state.experience) {
    return { ok: false, errorKey: "sessionExpired" }
  }

  // Capture the raw invite token before the cookie is cleared —
  // materializeInvite hashes it to flip the auth_invite row.
  const rawInviteToken = (await readRawInviteToken()) ?? ""

  // Idempotency guard (CR-2). If a session is already active, the BA
  // user was created in a previous attempt — skip signUpEmail.
  const session = await auth.api.getSession({ headers: await headers() })

  // Cross-tenant defence: an already-authenticated user must not be able
  // to redeem an invite addressed to a different email. The invite-start
  // cookie is signed but the claim is the recipient's email — without
  // this check, a logged-in attacker who obtains an invite URL could
  // attach the membership to their own account.
  if (session?.user?.email) {
    const sessionEmail = session.user.email.trim().toLowerCase()
    const claimEmail = claims.email.trim().toLowerCase()
    if (sessionEmail !== claimEmail) {
      return { ok: false, errorKey: "inviteEmailMismatch" }
    }
  }

  let userId: string | null = session?.user?.id ?? null

  if (!userId) {
    try {
      const signUp = await auth.api.signUpEmail({
        body: {
          email: claims.email,
          password: parsed.data.password,
          name: `${state.profile.firstName} ${state.profile.lastName}`.trim(),
        },
      })
      userId = signUp.user.id
    } catch (err) {
      if (isEmailAlreadyRegistered(err)) {
        return { ok: false, errorKey: "emailAlreadyRegistered" }
      }
      console.error("[onboarding/member/password] signUpEmail failed", err)
      return { ok: false, errorKey: "createAccountFailed" }
    }
  }

  if (!userId) {
    return { ok: false, errorKey: "createAccountFailed" }
  }

  try {
    await withAdminBypass(async (db) => {
      await db
        .update(app_user)
        .set({
          display_name:
            `${state.profile!.firstName} ${state.profile!.lastName}`.trim(),
          phone: state.profile!.phone || null,
          locale: state.profile!.locale,
          timezone: state.profile!.timezone,
          experience: state.experience,
          profile_completed_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(app_user.id, userId))
    })
  } catch (err) {
    console.error("[onboarding/member/password] persist profile failed", err)
    return { ok: false, errorKey: "saveProfileFailed" }
  }

  let orgSlug: string
  try {
    orgSlug = await materializeInvite({
      userId,
      inviteRawToken: rawInviteToken,
    })
  } catch (err) {
    console.error("[onboarding/member/password] materializeInvite failed", err)
    return { ok: false, errorKey: "acceptInviteFailed" }
  }

  await clearOnboardingState()
  await clearInviteCookie()
  return { ok: true, orgSlug }
}

/**
 * Step 4 — terminal; clears any leftover cookies. Idempotent because
 * cookies may already be gone after step 3 success.
 */
export async function completeMemberOnboardingAction(): Promise<void> {
  await clearOnboardingState()
  await clearInviteCookie()
}
