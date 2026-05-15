"use server"

import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { and, eq, sql } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { getBetterAuthUrl } from "@workspace/auth/env"
import { withAdminBypass, withWorkspace } from "@workspace/db"
import {
  app_user,
  organization,
  organization_membership,
  workspace,
  workspace_membership,
} from "@workspace/db/schema"
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

import { isEmailAlreadyRegistered } from "../auth/_lib/email-error"
import { issueInvite, revokePendingInvites } from "../auth/_lib/issue-invite"
import { setActiveWorkspaceCookie } from "./_lib/active-workspace-cookie"
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

// ---------------------------------------------------------------------------
// Step 4 — Workspace (creates workspace + owner membership +
// default organization, so step 6 has an org to issue invites against)
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

  let createdWorkspaceId: string | null = null
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
      createdWorkspaceId = ws.id
      const [wsMembership] = await db
        .insert(workspace_membership)
        .values({
          workspace_id: ws.id,
          user_id: userId,
          role: "owner",
        })
        .returning()
      if (!wsMembership) {
        throw new Error("workspace_membership insert returned no row")
      }

      // Default organization seeded so step 6 (team invites) can target
      // it. Slug = first available {base, base-2, base-3, ...}; legal
      // name mirrors the workspace display_name for now (editable later
      // from /[orgSlug]/settings).
      const slug = await pickUniqueSlug(db, ws.id, slugify(ws.display_name))
      // organization_id is NOT NULL on insert (no default); the trigger
      // app_organization_self_id ensures organization_id = id after the
      // row exists. We pass a fresh uuid here, then UPDATE to match.
      const [org] = await db
        .insert(organization)
        .values({
          organization_id: sql`uuidv7()`,
          workspace_id: ws.id,
          slug,
          legal_name: ws.display_name,
          person_kind: "legal_entity",
          legal_subject_kind: "for_profit",
        })
        .returning()
      if (!org) throw new Error("organization insert returned no row")

      // Backfill organization_id = id (trigger enforces this invariant).
      await db.execute(
        sql`UPDATE organization SET organization_id = id WHERE id = ${org.id}::uuid`,
      )

      await db.insert(organization_membership).values({
        organization_id: org.id,
        workspace_id: ws.id,
        user_id: userId,
        workspace_membership_id: wsMembership.id,
        role: "owner",
      })
    })
  } catch (err) {
    console.error("[onboarding/workspace] create workspace failed", err)
    return { ok: false, errorKey: "createWorkspaceFailed" }
  }

  // Pin the new workspace as the active one so subsequent steps (and
  // future writes) target it without re-deriving from `ORDER BY
  // created_at LIMIT 1`. The cookie outlives the onboarding flow.
  if (createdWorkspaceId) {
    await setActiveWorkspaceCookie(createdWorkspaceId)
  }

  return { ok: true }
}

/** Lowercase, replace non-alnum with `-`, collapse runs, trim. */
function slugify(input: string): string {
  const slug = input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48)
  // Slug column has a CHECK enforcing length >= 2; pad single-char or
  // empty results so the INSERT does not fail with a CHECK violation
  // for short workspace names like "A".
  if (slug.length < 2) return "workspace"
  return slug
}

const MAX_SLUG_ATTEMPTS = 50

async function pickUniqueSlug(
  db: import("@workspace/db").AdminBypassDb,
  workspaceId: string,
  base: string,
): Promise<string> {
  for (let i = 0; i < MAX_SLUG_ATTEMPTS; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`
    // Slug uniqueness is per (workspace_id, slug). Two workspaces with
    // display_name "Acme" should both be able to land slug "acme" inside
    // their own workspace; without this filter the second workspace
    // ratchets to "acme-2", "acme-3", etc.
    const [row] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(
        and(
          eq(organization.workspace_id, workspaceId),
          eq(organization.slug, candidate),
        ),
      )
      .limit(1)
    if (!row) return candidate
  }
  throw new Error("Could not pick a unique organization slug")
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
// Step 6 — Team (issues real invites against the default organization
// created at step 4, then marks step complete)
// ---------------------------------------------------------------------------

export interface TeamActionResult extends ActionResult {
  /** Number of invites successfully issued + emailed. */
  invitesSent?: number
  /** Per-email failure messages (if any). */
  failures?: Array<{ email: string; reason: string }>
}

export async function submitTeamAction(
  input: InviteListInput,
): Promise<TeamActionResult> {
  const parsed = InviteListSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: firstErrorKey(parsed.error.issues) }
  }

  const userId = await getActiveUserId()
  if (!userId) return { ok: false, errorKey: "sessionExpired" }
  const workspaceId = await findOwnerWorkspaceId(userId)
  if (!workspaceId) return { ok: false, errorKey: "noActiveWorkspace" }

  // Find the default organization seeded at step 4 (the workspace owner's
  // first org). Email invites target this organization. The invite row
  // carries workspace_id + organization_id; multi-org workspaces will
  // pick the right one from a future invite-people UI.
  const defaultOrgId = await withAdminBypass(async (db) => {
    const [row] = await db
      .select({ id: organization.id })
      .from(organization)
      .where(eq(organization.workspace_id, workspaceId))
      .orderBy(organization.created_at)
      .limit(1)
    return row?.id ?? null
  })
  if (!defaultOrgId) return { ok: false, errorKey: "noActiveWorkspace" }

  const baseUrl = getBetterAuthUrl()
  const brandName = await loadBrandName()

  const failures: Array<{ email: string; reason: string }> = []
  let sent = 0
  for (const row of parsed.data.invites) {
    if (!row.email) continue
    try {
      await revokePendingInvites({
        organizationId: defaultOrgId,
        email: row.email,
      })
      await issueInvite({
        email: row.email,
        organizationId: defaultOrgId,
        role: row.role,
        issuedByUserId: userId,
        baseUrl,
        brandName,
      })
      sent++
    } catch (err) {
      console.error("[onboarding/team] issueInvite failed", row.email, err)
      failures.push({
        email: row.email,
        reason: err instanceof Error ? err.message : "unknown",
      })
    }
  }

  // Mark step 3 complete only when the action made forward progress:
  // at least one invite was sent, OR the user explicitly submitted an
  // empty list ("Skip for now"). If every invite failed, leave the step
  // open so the user can retry.
  const requestedCount = parsed.data.invites.filter((r) => r.email).length
  if (sent > 0 || requestedCount === 0) {
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
  } else {
    // Every invite failed — surface the failures so the user retries.
    return { ok: false, errorKey: "saveTeamFailed", failures }
  }

  return { ok: true, invitesSent: sent, failures }
}

async function loadBrandName(): Promise<string> {
  // Dynamic import to avoid pulling next-intl/server into the action's
  // initial module graph when the action runs from a non-i18n context
  // (e.g. a test or a script that imports this module directly).
  const { getTranslations } = await import("@workspace/i18n/server")
  const t = await getTranslations("brand")
  return t("name")
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
