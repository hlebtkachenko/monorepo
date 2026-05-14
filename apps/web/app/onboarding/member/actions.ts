"use server"

import { headers } from "next/headers"
import { eq, and } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import {
  app_user,
  organization,
  organization_membership,
  workspace_membership,
} from "@workspace/db/schema"
import {
  OnboardingPasswordSchema,
  type OnboardingPasswordInput,
} from "@workspace/shared/auth"

import { readOnboardingState, clearOnboardingState } from "../_lib/state-cookie"
import { clearInviteCookie, readInviteClaims } from "./_lib/invite-cookie"

export interface MemberPasswordResult {
  ok: boolean
  errorKey?: string
  /** Slug of the organization the new member just joined. */
  orgSlug?: string
}

/**
 * Step 3 — creates the BA user, applies the cookie-stashed profile +
 * experience to the new app_user row, materializes the invite (workspace
 * + organization membership), then signs in. Returns the org slug so the
 * client can redirect to /[orgSlug] of the inviting org.
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

  let userId: string
  try {
    const signUp = await auth.api.signUpEmail({
      body: {
        email: claims.email,
        password: parsed.data.password,
        name: `${state.profile.firstName} ${state.profile.lastName}`.trim(),
      },
    })
    userId = signUp.user.id
  } catch {
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
  } catch {
    return { ok: false, errorKey: "saveProfileFailed" }
  }

  let orgSlug: string
  try {
    orgSlug = await materializeInvite({
      organizationId: claims.organizationId,
      role: claims.role,
      userId,
    })
  } catch {
    return { ok: false, errorKey: "acceptInviteFailed" }
  }

  try {
    await auth.api.signInEmail({
      body: { email: claims.email, password: parsed.data.password },
      headers: await headers(),
    })
  } catch {
    return { ok: false, errorKey: "createAccountFailed" }
  }

  await clearOnboardingState()
  await clearInviteCookie()
  return { ok: true, orgSlug }
}

/**
 * Step 4 — terminal; clears any leftover cookies and returns the org
 * slug stored at step 3. Idempotent because cookies are already gone.
 */
export async function completeMemberOnboardingAction(): Promise<void> {
  await clearOnboardingState()
  await clearInviteCookie()
}

// ---------------------------------------------------------------------------
// materializeInvite — shared helper between /auth/invite/actions.ts and
// the member onboarding step 3. Creates workspace_membership +
// organization_membership for the user joining `organizationId`. Runs
// under withAdminBypass because no tenancy context is bound at this
// moment.
// ---------------------------------------------------------------------------

async function materializeInvite(input: {
  organizationId: string
  role: "owner" | "admin" | "member" | "agent" | "guest"
  userId: string
}): Promise<string> {
  return await withAdminBypass(async (db) => {
    const [org] = await db
      .select({
        id: organization.id,
        workspace_id: organization.workspace_id,
        slug: organization.slug,
      })
      .from(organization)
      .where(eq(organization.id, input.organizationId))
      .limit(1)
    if (!org) {
      throw new Error("Organization not found for invite.")
    }

    const [existingWsM] = await db
      .select({ id: workspace_membership.id })
      .from(workspace_membership)
      .where(
        and(
          eq(workspace_membership.workspace_id, org.workspace_id),
          eq(workspace_membership.user_id, input.userId),
          eq(workspace_membership.active, true),
        ),
      )
      .limit(1)

    let wsMembershipId: string
    if (existingWsM) {
      wsMembershipId = existingWsM.id
    } else {
      const [inserted] = await db
        .insert(workspace_membership)
        .values({
          workspace_id: org.workspace_id,
          user_id: input.userId,
          role: "member",
        })
        .returning()
      if (!inserted) {
        throw new Error("Could not create workspace membership.")
      }
      wsMembershipId = inserted.id
    }

    await db.insert(organization_membership).values({
      organization_id: org.id,
      workspace_id: org.workspace_id,
      user_id: input.userId,
      workspace_membership_id: wsMembershipId,
      role: input.role,
    })

    return org.slug
  })
}
