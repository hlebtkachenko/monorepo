"use server"

import { headers } from "next/headers"
import { and, eq, sql } from "drizzle-orm"
import { auth } from "@workspace/auth/server"
import { getBetterAuthUrl } from "@workspace/auth/env"
import { notifierFromEnv } from "@workspace/notify"
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

import { logServerError } from "../../lib/log-server-error"
import { isEmailAlreadyRegistered } from "../auth/_lib/email-error"
import { issueInvite, revokePendingInvites } from "../auth/_lib/issue-invite"
import { materializeInvite } from "../auth/_lib/materialize-invite"
import { setActiveWorkspaceCookie } from "./_lib/active-workspace-cookie"
import {
  clearInviteCookie,
  readInviteClaims,
  readRawInviteToken,
} from "./_lib/invite-cookie"
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

/**
 * Member password action returns the org slug so the client can
 * redirect to the freshly-joined organization.
 */
export interface MemberPasswordResult extends ActionResult {
  orgSlug?: string
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

async function getActiveUserId(): Promise<string | null> {
  const session = await auth.api.getSession({ headers: await headers() })
  return session?.user?.id ?? null
}

// Server-side validation failures surface one generic error. Field-level
// messages are the client form's job; the zod issue messages are
// `auth.validation` keys, which the `onboarding.errors` namespace the forms
// resolve against can never contain — passing them through rendered raw keys.
function firstErrorKey(_zodIssues: Array<{ message: string }>): string {
  return "invalidInput"
}

// ---------------------------------------------------------------------------
// Step 1 — Profile (shared owner + member)
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
// Step 2 — Experience (shared owner + member)
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
// Step 3 — Password (role-aware)
//
// Owner: signs up via signup-cookie email, writes profile + experience,
// clears signup cookie at the /done step.
//
// Member: signs up via invite-cookie email, writes profile + experience,
// materializes the invite (workspace_membership + organization_membership),
// returns the org slug.
//
// Idempotent across double-clicks and refreshes: if a session already
// exists (because the user already submitted this step in this browser
// or a previous attempt completed signUpEmail and was interrupted before
// cookie cleanup), the action skips re-creating the BA account and only
// runs the "persist profile + cleanup" tail.
// ---------------------------------------------------------------------------

export async function submitPasswordAction(
  input: OnboardingPasswordInput,
): Promise<MemberPasswordResult> {
  const parsed = OnboardingPasswordSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, errorKey: firstErrorKey(parsed.error.issues) }
  }

  // Detect role from cookies. Invite wins over signup when both are
  // present (stronger intent: a specific org membership).
  const invite = await readInviteClaims()
  const signup = invite ? null : await readSignupClaims()
  const email = invite?.email ?? signup?.email
  if (!email) {
    return { ok: false, errorKey: "sessionExpired" }
  }

  const state = await readOnboardingState()
  if (!state.profile || !state.experience) {
    return { ok: false, errorKey: "sessionExpired" }
  }

  // Idempotency guard: if a session already exists, the BA user was
  // created by an earlier attempt — skip re-creating it below.
  const session = await auth.api.getSession({ headers: await headers() })

  // Cross-tenant defence: an already-authenticated user must not redeem
  // an invite addressed to a different email. Without this check a
  // logged-in attacker who obtains an invite URL could attach the
  // membership to their own account.
  if (invite && session?.user?.email) {
    const sessionEmail = session.user.email.trim().toLowerCase()
    if (sessionEmail !== invite.email.trim().toLowerCase()) {
      return { ok: false, errorKey: "inviteEmailMismatch" }
    }
  }

  let userId: string | null = session?.user?.id ?? null

  if (!userId) {
    try {
      const signUp = await auth.api.signUpEmail({
        body: {
          email,
          password: parsed.data.password,
          name: `${state.profile.firstName} ${state.profile.lastName}`.trim(),
        },
      })
      userId = signUp.user.id
    } catch (err) {
      if (isEmailAlreadyRegistered(err)) {
        return { ok: false, errorKey: "emailAlreadyRegistered" }
      }
      logServerError("onboarding/password signUpEmail failed", err)
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
    logServerError("onboarding/password persist profile failed", err)
    return { ok: false, errorKey: "persistOnboardingFailed" }
  }

  // Member branch — accept the invite, return the org slug.
  if (invite) {
    const rawInviteToken = (await readRawInviteToken()) ?? ""
    let orgSlug: string
    try {
      orgSlug = await materializeInvite({
        userId,
        inviteRawToken: rawInviteToken,
      })
    } catch (err) {
      logServerError("onboarding/password materializeInvite failed", err)
      return { ok: false, errorKey: "acceptInviteFailed" }
    }
    await clearOnboardingState()
    await clearInviteCookie()
    return { ok: true, orgSlug }
  }

  // Owner branch — keep signup cookie until /done so resume.ts can
  // still detect the role until completion.
  await clearOnboardingState()
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Step 4 — Workspace (owner only)
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
    logServerError("onboarding/workspace create workspace failed", err)
    return { ok: false, errorKey: "createWorkspaceFailed" }
  }

  if (createdWorkspaceId) {
    await setActiveWorkspaceCookie(createdWorkspaceId)
  }

  // Fire-and-forget business-event ping; no-op when the bot env is unset.
  const notifier = notifierFromEnv()
  if (notifier) {
    void notifier
      .notify(`👤 New workspace: ${parsed.data.displayName}`, { source: "web" })
      .catch(() => {})
  }

  return { ok: true }
}

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
// Step 5 — Plan (owner only)
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
// Step 6 — Team (owner only)
// ---------------------------------------------------------------------------

export interface TeamActionResult extends ActionResult {
  invitesSent?: number
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

  // Rows are independent: revoke+issue per invitee runs concurrently
  // (each is a DB write + an outbound email POST), with per-row failure
  // collection preserved via allSettled.
  const rows = parsed.data.invites.filter((row) => row.email)
  const results = await Promise.allSettled(
    rows.map(async (row) => {
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
    }),
  )

  const failures: Array<{ email: string; reason: string }> = []
  let sent = 0
  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      sent++
      return
    }
    // No invitee email in the log line — that is PII in CloudWatch.
    logServerError("onboarding/team issueInvite failed", result.reason)
    failures.push({
      email: rows[i]!.email,
      reason:
        result.reason instanceof Error ? result.reason.message : "unknown",
    })
  })

  // Mark step 3 complete only when the action made forward progress:
  // at least one invite was sent, OR the user explicitly submitted an
  // empty list ("Skip for now"). If every invite failed, leave the step
  // open so the user can retry.
  const requestedCount = rows.length
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
  const { getTranslations } = await import("@workspace/i18n/server")
  const t = await getTranslations("brand")
  return t("name")
}

// ---------------------------------------------------------------------------
// Step 7 — Done (role-aware)
// ---------------------------------------------------------------------------

export async function completeOnboardingAction(): Promise<ActionResult> {
  // Member branch: cookies may already be gone (cleared after step 3).
  // Idempotent — just clear any residue.
  const invite = await readInviteClaims()
  if (invite) {
    await clearOnboardingState()
    await clearInviteCookie()
    return { ok: true }
  }

  // Owner branch: finalize the workspace + clear signup cookie.
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
