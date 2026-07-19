"use server"

import { randomInt } from "node:crypto"
import { headers } from "next/headers"
import { and, asc, eq, inArray, isNull, ne, or, sql } from "drizzle-orm"
import { z } from "zod"

import { auth } from "@workspace/auth/server"
import { withAdminBypass, type AdminBypassDb } from "@workspace/db"
import {
  admin_staff_role,
  api_key,
  app_user,
  audit_event,
  auth_account,
  auth_session,
  auth_token,
  auth_verification,
  organization,
  organization_membership,
  two_factor,
  workspace,
  workspace_membership,
} from "@workspace/db/schema"
import { accountDangerOtpEmail, sendEmail } from "@workspace/email"

import { deleteAvatar } from "../../_lib/avatar-storage"
import { clearActiveWorkspaceCookie } from "@/lib/active-workspace-cookie"
import { logServerError } from "../../../lib/log-server-error"
import { getWorkspaceContext } from "../_lib/workspace-context"
import { createDangerOtpValue, verifyDangerOtpValue } from "./danger-otp"

const DangerPurposeSchema = z.enum(["delete_account", "leave_workspace"])
const OtpSchema = z.string().regex(/^\d{6}$/)
const OTP_TTL_MS = 10 * 60 * 1000
const OTP_RESEND_COOLDOWN_MS = 60 * 1000
const MAX_OTP_ATTEMPTS = 5
const CONFIRMATION_PHRASES: Record<DangerPurpose, string> = {
  delete_account: "DELETE MY ACCOUNT",
  leave_workspace: "LEAVE WORKSPACE",
}

export type DangerPurpose = z.infer<typeof DangerPurposeSchema>

export interface DangerActionResult {
  ok: boolean
  errorKey?: string
  retryAfterSeconds?: number
}

export interface DangerAvailability {
  authenticated: boolean
  workspaceName: string | null
  leaveBlockedByOwnership: boolean
  deleteBlockedWorkspace: string | null
}

function otpIdentifier(userId: string, purpose: DangerPurpose): string {
  return `app:profile-danger:${purpose}:${userId}`
}

function otpSecret(): string {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret || new TextEncoder().encode(secret).byteLength < 32) {
    throw new Error("BETTER_AUTH_SECRET is required for profile danger OTP")
  }
  return secret
}

async function findBlockingOwnerWorkspace(
  db: AdminBypassDb,
  userId: string,
  workspaceId?: string,
  lockOwners = false,
): Promise<string | null> {
  const memberships = await db
    .select({
      workspaceId: workspace_membership.workspace_id,
      workspaceName: workspace.display_name,
      role: workspace_membership.role,
    })
    .from(workspace_membership)
    .innerJoin(workspace, eq(workspace.id, workspace_membership.workspace_id))
    .where(
      and(
        eq(workspace_membership.user_id, userId),
        eq(workspace_membership.active, true),
        workspaceId
          ? eq(workspace_membership.workspace_id, workspaceId)
          : undefined,
      ),
    )

  const owned = memberships.filter((membership) => membership.role === "owner")
  if (owned.length === 0) return null

  const ownedWorkspaceIds = owned.map((membership) => membership.workspaceId)
  if (lockOwners) {
    await db
      .select({ id: workspace_membership.id })
      .from(workspace_membership)
      .where(
        and(
          inArray(workspace_membership.workspace_id, ownedWorkspaceIds),
          eq(workspace_membership.role, "owner"),
          eq(workspace_membership.active, true),
        ),
      )
      .orderBy(
        asc(workspace_membership.workspace_id),
        asc(workspace_membership.id),
      )
      .for("update")
  }

  const ownerCounts = await db
    .select({
      workspaceId: workspace_membership.workspace_id,
      count: sql<number>`count(*)::int`,
    })
    .from(workspace_membership)
    .where(
      and(
        inArray(workspace_membership.workspace_id, ownedWorkspaceIds),
        eq(workspace_membership.role, "owner"),
        eq(workspace_membership.active, true),
      ),
    )
    .groupBy(workspace_membership.workspace_id)

  const counts = new Map(
    ownerCounts.map((owner) => [owner.workspaceId, owner.count]),
  )
  return (
    owned.find((membership) => (counts.get(membership.workspaceId) ?? 0) <= 1)
      ?.workspaceName ?? null
  )
}

async function blockingOwnerWorkspace(
  userId: string,
  workspaceId?: string,
): Promise<string | null> {
  return withAdminBypass((db) =>
    findBlockingOwnerWorkspace(db, userId, workspaceId),
  )
}

async function validateDangerOwnership(
  userId: string,
  purpose: DangerPurpose,
): Promise<DangerActionResult> {
  const context = await getWorkspaceContext(userId)
  if (purpose === "leave_workspace" && !context.activeWorkspaceId) {
    return { ok: false, errorKey: "noActiveWorkspace" }
  }
  const blockedWorkspace = await blockingOwnerWorkspace(
    userId,
    purpose === "leave_workspace"
      ? (context.activeWorkspaceId ?? undefined)
      : undefined,
  )
  return blockedWorkspace
    ? { ok: false, errorKey: "transferWorkspaceOwnership" }
    : { ok: true }
}

export async function getDangerAvailabilityAction(): Promise<DangerAvailability> {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) {
    return {
      authenticated: false,
      workspaceName: null,
      leaveBlockedByOwnership: false,
      deleteBlockedWorkspace: null,
    }
  }
  const context = await getWorkspaceContext(session.user.id)
  const [leaveBlock, deleteBlock] = await Promise.all([
    context.activeWorkspaceId
      ? blockingOwnerWorkspace(session.user.id, context.activeWorkspaceId)
      : Promise.resolve(null),
    blockingOwnerWorkspace(session.user.id),
  ])
  return {
    authenticated: true,
    workspaceName: context.current?.name ?? null,
    leaveBlockedByOwnership: leaveBlock !== null,
    deleteBlockedWorkspace: deleteBlock,
  }
}

export async function requestDangerOtpAction(
  rawPurpose: DangerPurpose,
): Promise<DangerActionResult> {
  const purpose = DangerPurposeSchema.safeParse(rawPurpose)
  if (!purpose.success) return { ok: false, errorKey: "invalidInput" }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }
  const allowed = await validateDangerOwnership(session.user.id, purpose.data)
  if (!allowed.ok) return allowed

  const identifier = otpIdentifier(session.user.id, purpose.data)
  const code = String(randomInt(100_000, 1_000_000))
  const now = new Date()
  const expiresAt = new Date(now.getTime() + OTP_TTL_MS)

  try {
    const issued = await withAdminBypass(async (db) => {
      await db.execute(
        sql`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`,
      )
      const [existing] = await db
        .select({
          id: auth_verification.id,
          updatedAt: auth_verification.updated_at,
        })
        .from(auth_verification)
        .where(eq(auth_verification.identifier, identifier))
        .limit(1)

      if (
        existing &&
        now.getTime() - existing.updatedAt.getTime() < OTP_RESEND_COOLDOWN_MS
      ) {
        return {
          ok: false as const,
          retryAfterSeconds: Math.ceil(
            (OTP_RESEND_COOLDOWN_MS -
              (now.getTime() - existing.updatedAt.getTime())) /
              1000,
          ),
        }
      }

      const value = createDangerOtpValue(otpSecret(), identifier, code)
      if (existing) {
        await db
          .update(auth_verification)
          .set({ value, expires_at: expiresAt, updated_at: now })
          .where(eq(auth_verification.id, existing.id))
      } else {
        await db.insert(auth_verification).values({
          identifier,
          value,
          expires_at: expiresAt,
          updated_at: now,
        })
      }
      return { ok: true as const }
    })

    if (!issued.ok) {
      return {
        ok: false,
        errorKey: "otpCooldown",
        retryAfterSeconds: issued.retryAfterSeconds,
      }
    }

    try {
      await sendEmail(
        accountDangerOtpEmail({
          to: session.user.email,
          code,
          purpose: purpose.data,
        }),
      )
    } catch (err) {
      await withAdminBypass((db) =>
        db
          .delete(auth_verification)
          .where(eq(auth_verification.identifier, identifier)),
      )
      throw err
    }
  } catch (err) {
    logServerError("workspace/profile danger OTP request failed", err)
    return { ok: false, errorKey: "otpSendFailed" }
  }

  return { ok: true }
}

async function verifyOtp(
  userId: string,
  purpose: DangerPurpose,
  code: string,
): Promise<
  { ok: true; challengeId: string } | { ok: false; errorKey: string }
> {
  const identifier = otpIdentifier(userId, purpose)
  return withAdminBypass(async (db) => {
    await db.execute(
      sql`SELECT pg_advisory_xact_lock(hashtextextended(${identifier}, 0))`,
    )
    const [row] = await db
      .select({
        id: auth_verification.id,
        value: auth_verification.value,
        expiresAt: auth_verification.expires_at,
      })
      .from(auth_verification)
      .where(eq(auth_verification.identifier, identifier))
      .limit(1)
    if (!row || row.expiresAt.getTime() <= Date.now()) {
      if (row) {
        await db
          .delete(auth_verification)
          .where(eq(auth_verification.id, row.id))
      }
      return { ok: false as const, errorKey: "otpInvalid" }
    }

    const { matches, attempts, storedHash } = verifyDangerOtpValue(
      otpSecret(),
      identifier,
      code,
      row.value,
    )

    if (!matches) {
      if (attempts + 1 >= MAX_OTP_ATTEMPTS) {
        await db
          .delete(auth_verification)
          .where(eq(auth_verification.id, row.id))
      } else {
        await db
          .update(auth_verification)
          .set({
            value: `${storedHash}:${attempts + 1}`,
            updated_at: new Date(),
          })
          .where(eq(auth_verification.id, row.id))
      }
      return { ok: false as const, errorKey: "otpInvalid" }
    }

    return { ok: true as const, challengeId: row.id }
  })
}

export async function confirmLeaveWorkspaceAction(
  rawPhrase: string,
  rawCode: string,
): Promise<DangerActionResult> {
  if (rawPhrase !== CONFIRMATION_PHRASES.leave_workspace) {
    return { ok: false, errorKey: "confirmationPhraseInvalid" }
  }
  const code = OtpSchema.safeParse(rawCode)
  if (!code.success) return { ok: false, errorKey: "otpInvalid" }

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session) return { ok: false, errorKey: "sessionExpired" }
  const context = await getWorkspaceContext(session.user.id)
  if (!context.activeWorkspaceId) {
    return { ok: false, errorKey: "noActiveWorkspace" }
  }
  const allowed = await validateDangerOwnership(
    session.user.id,
    "leave_workspace",
  )
  if (!allowed.ok) return allowed
  const verified = await verifyOtp(
    session.user.id,
    "leave_workspace",
    code.data,
  )
  if (!verified.ok) return verified

  try {
    const result = await withAdminBypass(async (db) => {
      const blockedWorkspace = await findBlockingOwnerWorkspace(
        db,
        session.user.id,
        context.activeWorkspaceId!,
        true,
      )
      if (blockedWorkspace) return { blockedWorkspace }

      const consumed = await db
        .delete(auth_verification)
        .where(eq(auth_verification.id, verified.challengeId))
        .returning({ id: auth_verification.id })
      if (consumed.length === 0) throw new Error("OTP already consumed")

      await db
        .update(organization)
        .set({ responsible_user_id: null, updated_at: new Date() })
        .where(
          and(
            eq(organization.workspace_id, context.activeWorkspaceId!),
            eq(organization.responsible_user_id, session.user.id),
          ),
        )
      await db
        .update(organization_membership)
        .set({ active: false, updated_at: new Date() })
        .where(
          and(
            eq(organization_membership.user_id, session.user.id),
            eq(
              organization_membership.workspace_id,
              context.activeWorkspaceId!,
            ),
          ),
        )
      await db
        .update(workspace_membership)
        .set({ active: false, updated_at: new Date() })
        .where(
          and(
            eq(workspace_membership.user_id, session.user.id),
            eq(workspace_membership.workspace_id, context.activeWorkspaceId!),
          ),
        )
      await db.insert(audit_event).values({
        workspace_id: context.activeWorkspaceId,
        actor_user_id: session.user.id,
        action: "profile.workspace_left",
        payload: {},
      })
      return { blockedWorkspace: null }
    })
    if (result.blockedWorkspace) {
      return { ok: false, errorKey: "transferWorkspaceOwnership" }
    }
  } catch (err) {
    logServerError("workspace/profile leave workspace failed", err)
    return { ok: false, errorKey: "leaveWorkspaceFailed" }
  }

  await clearActiveWorkspaceCookie()
  return { ok: true }
}

export async function confirmDeleteAccountAction(
  rawPhrase: string,
  rawCode: string,
): Promise<DangerActionResult> {
  if (rawPhrase !== CONFIRMATION_PHRASES.delete_account) {
    return { ok: false, errorKey: "confirmationPhraseInvalid" }
  }
  const code = OtpSchema.safeParse(rawCode)
  if (!code.success) return { ok: false, errorKey: "otpInvalid" }

  const requestHeaders = await headers()
  const session = await auth.api.getSession({ headers: requestHeaders })
  if (!session) return { ok: false, errorKey: "sessionExpired" }
  const allowed = await validateDangerOwnership(
    session.user.id,
    "delete_account",
  )
  if (!allowed.ok) return allowed
  const verified = await verifyOtp(session.user.id, "delete_account", code.data)
  if (!verified.ok) return verified

  const context = await getWorkspaceContext(session.user.id)
  const userRecord = await withAdminBypass(async (db) => {
    const [row] = await db
      .select({ avatarKey: app_user.avatar_url })
      .from(app_user)
      .where(eq(app_user.id, session.user.id))
      .limit(1)
    return row
  })

  try {
    const result = await withAdminBypass(async (db) => {
      const blockedWorkspace = await findBlockingOwnerWorkspace(
        db,
        session.user.id,
        undefined,
        true,
      )
      if (blockedWorkspace) return { blockedWorkspace }

      const consumed = await db
        .delete(auth_verification)
        .where(eq(auth_verification.id, verified.challengeId))
        .returning({ id: auth_verification.id })
      if (consumed.length === 0) throw new Error("OTP already consumed")

      await db.insert(audit_event).values({
        workspace_id: context.activeWorkspaceId,
        actor_user_id: session.user.id,
        action: "profile.account_deleted",
        payload: {},
      })
      await db
        .update(api_key)
        .set({ revoked_at: sql`now()`, updated_at: sql`now()` })
        .where(
          and(
            eq(api_key.created_by_user_id, session.user.id),
            isNull(api_key.revoked_at),
          ),
        )
      await db
        .update(auth_token)
        .set({ status: "revoked" })
        .where(
          and(
            eq(auth_token.status, "pending"),
            or(
              eq(auth_token.issued_to_user_id, session.user.id),
              sql`${auth_token.payload}->>'email' = ${session.user.email}`,
            ),
          ),
        )
      await db
        .delete(auth_token)
        .where(
          and(
            ne(auth_token.status, "pending"),
            or(
              eq(auth_token.issued_to_user_id, session.user.id),
              sql`${auth_token.payload}->>'email' = ${session.user.email}`,
            ),
          ),
        )
      await db
        .delete(auth_verification)
        .where(
          or(
            sql`strpos(${auth_verification.identifier}, ${session.user.email}) > 0`,
            sql`strpos(${auth_verification.identifier}, ${session.user.id}) > 0`,
            sql`strpos(${auth_verification.value}, ${session.user.email}) > 0`,
            sql`strpos(${auth_verification.value}, ${session.user.id}) > 0`,
          ),
        )
      await db
        .delete(auth_account)
        .where(eq(auth_account.user_id, session.user.id))
      await db.delete(two_factor).where(eq(two_factor.user_id, session.user.id))
      await db
        .delete(admin_staff_role)
        .where(eq(admin_staff_role.user_id, session.user.id))
      await db
        .update(organization)
        .set({ responsible_user_id: null, updated_at: new Date() })
        .where(eq(organization.responsible_user_id, session.user.id))
      await db
        .update(organization_membership)
        .set({ active: false, updated_at: new Date() })
        .where(eq(organization_membership.user_id, session.user.id))
      await db
        .update(workspace_membership)
        .set({ active: false, updated_at: new Date() })
        .where(eq(workspace_membership.user_id, session.user.id))
      await db
        .delete(auth_session)
        .where(
          or(
            eq(auth_session.user_id, session.user.id),
            eq(auth_session.impersonated_by, session.user.id),
          ),
        )
      await db
        .update(app_user)
        .set({
          email: `deleted+${session.user.id}@deleted.invalid`,
          email_verified: false,
          name: "Deleted user",
          image: null,
          role: "user",
          banned: true,
          ban_reason: "account_deleted",
          ban_expires: null,
          phone: null,
          two_factor_enabled: false,
          display_name: "Deleted user",
          avatar_url: null,
          title_prefix: null,
          given_name: null,
          family_name: null,
          title_suffix: null,
          department: null,
          locale: "en",
          theme: "system",
          icon_style: "lucide",
          timezone: "UTC",
          date_format: "DD/MM/YYYY",
          time_format: "24-hour",
          marketing_consent: false,
          product_updates_consent: false,
          signature_data: null,
          job_title: null,
          experience: null,
          profile_completed_at: null,
          deleted_at: new Date(),
          updated_at: new Date(),
        })
        .where(eq(app_user.id, session.user.id))
      return { blockedWorkspace: null }
    })
    if (result.blockedWorkspace) {
      return { ok: false, errorKey: "transferWorkspaceOwnership" }
    }
  } catch (err) {
    logServerError("workspace/profile account delete failed", err)
    return { ok: false, errorKey: "deleteAccountFailed" }
  }

  if (userRecord?.avatarKey) {
    try {
      await deleteAvatar(userRecord.avatarKey)
    } catch (err) {
      // Account access and the database reference are already removed. A
      // storage cleanup failure must not resurrect a deleted account.
      logServerError("workspace/profile account avatar cleanup failed", err)
    }
  }

  try {
    await auth.api.signOut({ headers: requestHeaders })
  } catch {
    // Sessions are already removed. Cookie cleanup continues below.
  }
  await clearActiveWorkspaceCookie()
  return { ok: true }
}
