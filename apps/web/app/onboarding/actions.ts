"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { eq } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { withAdminBypass, withWorkspace } from "@workspace/db"
import { app_user, workspace, workspace_membership } from "@workspace/db/schema"
import {
  ExperienceSchema,
  type ExperienceInput,
  InviteListSchema,
  type InviteListInput,
  OnboardingPasswordSchema,
  type OnboardingPasswordInput,
  PlanSchema,
  type PlanInput,
  ProfileSchema,
  type ProfileInput,
  WorkspaceSchema,
  type WorkspaceInput,
} from "@workspace/shared/auth"

import { findOwnerWorkspaceId } from "./_lib/resume"
import { readSignupClaims, clearSignupCookie } from "./_lib/signup-cookie"
import {
  clearOnboardingState,
  readOnboardingState,
  writeOnboardingState,
} from "./_lib/state-cookie"

export interface ActionResult {
  ok: boolean
  errorKey?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getActiveUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

function firstErrorKey(zodIssues: Array<{ message: string }>): string {
  return zodIssues[0]?.message ?? "invalid"
}

// ---------------------------------------------------------------------------
// Step 1 — Profile
// ---------------------------------------------------------------------------

export async function submitProfileAction(
  input: ProfileInput,
): Promise<ActionResult> {
  const parsed = ProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: firstErrorKey(parsed.error.issues) }
  }

  const userId = await getActiveUserId()
  if (userId) {
    try {
      await withAdminBypass(async (db) => {
        await db
          .update(app_user)
          .set({
            name: `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
            display_name:
              `${parsed.data.firstName} ${parsed.data.lastName}`.trim(),
            phone: parsed.data.phone || null,
            locale: parsed.data.locale,
            timezone: parsed.data.timezone,
            profile_completed_at: new Date(),
            updated_at: new Date(),
          })
          .where(eq(app_user.id, userId))
      })
    } catch {
      return { ok: false, errorKey: "saveProfileFailed" }
    }
  } else {
    await writeOnboardingState({ profile: parsed.data })
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Step 2 — Experience
// ---------------------------------------------------------------------------

export async function submitExperienceAction(
  input: ExperienceInput,
): Promise<ActionResult> {
  const parsed = ExperienceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: firstErrorKey(parsed.error.issues) }
  }

  const userId = await getActiveUserId()
  if (userId) {
    try {
      await withAdminBypass(async (db) => {
        await db
          .update(app_user)
          .set({
            experience: parsed.data.experience,
            updated_at: new Date(),
          })
          .where(eq(app_user.id, userId))
      })
    } catch {
      return { ok: false, errorKey: "saveExperienceFailed" }
    }
  } else {
    await writeOnboardingState({ experience: parsed.data.experience })
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Step 3 — Password (creates the BA user, applies cookie state)
//
// Idempotent across double-clicks and refreshes: if a session already
// exists (because the user already submitted this step in this browser
// or a previous attempt completed signUpEmail and was interrupted before
// cookie cleanup), the action skips re-creating the BA account and only
// runs the "persist profile + experience + clear cookie" tail.
// ---------------------------------------------------------------------------

export async function submitPasswordAction(
  input: OnboardingPasswordInput,
): Promise<ActionResult> {
  const parsed = OnboardingPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: firstErrorKey(parsed.error.issues) }
  }

  const claims = await readSignupClaims()
  if (!claims) {
    return { ok: false, errorKey: "sessionExpired" }
  }
  const state = await readOnboardingState()
  if (!state.profile || !state.experience) {
    // User skipped steps 1-2 somehow. Force them back.
    return { ok: false, errorKey: "sessionExpired" }
  }

  // Idempotency guard: if a session already exists for this email, the
  // BA user was already created by an earlier attempt. Skip signUpEmail
  // and proceed to the profile UPDATE + cookie cleanup. Without this,
  // a double-click or refresh hits BA's "email already exists" path,
  // which is opaque to the user and leaves the cookie state dangling.
  let userId: string | null = await getActiveUserId()

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
      // Surface the actionable "account already exists" case so the user
      // can recover via /auth/login. Other failures stay generic.
      if (isEmailAlreadyRegistered(err)) {
        return { ok: false, errorKey: "emailAlreadyRegistered" }
      }
      console.error("[onboarding/password] signUpEmail failed", err)
      return { ok: false, errorKey: "createAccountFailed" }
    }
  }

  if (!userId) {
    return { ok: false, errorKey: "createAccountFailed" }
  }

  // Persist profile + experience onto the new app_user row. autoSignIn:true
  // + the nextCookies plugin in @workspace/auth/server forward the session
  // cookie automatically, so no manual signInEmail call is needed here.
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
    console.error("[onboarding/password] persist profile failed", err)
    return { ok: false, errorKey: "saveProfileFailed" }
  }

  await clearOnboardingState()
  return { ok: true }
}

function isEmailAlreadyRegistered(err: unknown): boolean {
  if (!(err instanceof Error)) return false
  return /already.*exist|already.*registered|user.*exist|duplicate/i.test(
    err.message,
  )
}

// ---------------------------------------------------------------------------
// Step 4 — Workspace (creates workspace + owner membership)
// ---------------------------------------------------------------------------

export async function submitWorkspaceAction(
  input: WorkspaceInput,
): Promise<ActionResult> {
  const parsed = WorkspaceSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: firstErrorKey(parsed.error.issues) }
  }

  const userId = await getActiveUserId()
  if (!userId) {
    return { ok: false, errorKey: "sessionExpired" }
  }

  try {
    await withAdminBypass(async (db) => {
      const [user] = await db
        .select({ email: app_user.email })
        .from(app_user)
        .where(eq(app_user.id, userId))
        .limit(1)
      const contactEmail = user?.email ?? null

      const [ws] = await db
        .insert(workspace)
        .values({
          display_name: parsed.data.displayName,
          contact_email: contactEmail,
          use_case: parsed.data.useCase,
          team_size: parsed.data.teamSize,
          created_by_user_id: userId,
          step_1_completed_at: new Date(),
        })
        .returning()
      if (!ws) throw new Error("workspace insert returned no row")
      await db.insert(workspace_membership).values({
        workspace_id: ws.id,
        user_id: userId,
        role: "owner",
      })
    })
  } catch {
    return { ok: false, errorKey: "createWorkspaceFailed" }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Step 5 — Plan (records plan choice on workspace, no Stripe wiring)
// ---------------------------------------------------------------------------

export async function submitPlanAction(
  input: PlanInput,
): Promise<ActionResult> {
  const parsed = PlanSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: firstErrorKey(parsed.error.issues) }
  }

  const userId = await getActiveUserId()
  if (!userId) return { ok: false, errorKey: "sessionExpired" }
  const workspaceId = await findOwnerWorkspaceId(userId)
  if (!workspaceId) return { ok: false, errorKey: "noActiveWorkspace" }

  try {
    await withWorkspace(workspaceId, userId, async (db) => {
      await db
        .update(workspace)
        .set({
          plan: parsed.data.plan,
          step_2_completed_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(workspace.id, workspaceId))
    })
  } catch {
    return { ok: false, errorKey: "savePlanFailed" }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Step 6 — Team (validates invites + marks step complete)
// ---------------------------------------------------------------------------

// Step 6 records the user's intent. We do NOT write `auth_invite` rows
// yet because that table requires `organization_id`, and no organization
// exists during owner onboarding (the workspace is empty). The collected
// invites are validated and dropped; the user re-invites teammates from
// workspace settings after creating the first organization. This is
// surfaced in the i18n copy: onboarding.team.note.

export async function submitTeamAction(
  input: InviteListInput,
): Promise<ActionResult> {
  const parsed = InviteListSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: firstErrorKey(parsed.error.issues) }
  }

  const userId = await getActiveUserId()
  if (!userId) return { ok: false, errorKey: "sessionExpired" }
  const workspaceId = await findOwnerWorkspaceId(userId)
  if (!workspaceId) return { ok: false, errorKey: "noActiveWorkspace" }

  try {
    await withWorkspace(workspaceId, userId, async (db) => {
      await db
        .update(workspace)
        .set({
          step_3_completed_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(workspace.id, workspaceId))
    })
  } catch {
    return { ok: false, errorKey: "saveTeamFailed" }
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Step 7 — Done (marks onboarding complete + clears signup cookie)
// ---------------------------------------------------------------------------

export async function completeOnboardingAction(): Promise<ActionResult> {
  const userId = await getActiveUserId()
  if (!userId) return { ok: false, errorKey: "sessionExpired" }
  const workspaceId = await findOwnerWorkspaceId(userId)
  if (!workspaceId) return { ok: false, errorKey: "noActiveWorkspace" }

  try {
    await withWorkspace(workspaceId, userId, async (db) => {
      const now = new Date()
      await db
        .update(workspace)
        .set({
          step_4_completed_at: now,
          onboarding_completed_at: now,
          updated_at: now,
        })
        .where(eq(workspace.id, workspaceId))
    })
  } catch {
    return { ok: false, errorKey: "createWorkspaceFailed" }
  }

  await clearSignupCookie()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Misc — "use a different email" from welcome
// ---------------------------------------------------------------------------

export async function abandonOnboardingAction(): Promise<void> {
  await clearOnboardingState()
  await clearSignupCookie()
  redirect("/auth/login")
}
