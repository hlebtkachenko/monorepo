"use server"

import "server-only"

import { and, desc, eq, gt, isNull, sql } from "drizzle-orm"

import { auth } from "@workspace/auth/server"
import { withAdminBypass } from "@workspace/db"
import { app_user, impersonation, organization } from "@workspace/db/schema"

import { auditAdminAction } from "./admin-audit"
import { requireAdminCapability } from "./admin-capability"
import { requireAdminSession } from "./admin-session"
import { requireStepUpForAction } from "./step-up"
import type {
  ImpersonationMutationResult,
  ImpersonationState,
  StartImpersonationInput,
} from "./admin-impersonation-types"

const IMPERSONATION_TTL_MS = 30 * 60 * 1000
const MIN_REASON_LENGTH = 8

/**
 * Returns the most recent active impersonation row for the current staff
 * user, joined to `app_user` for the target's email. Returns `null` when
 * no row is active (no impersonation started, already ended, or expired).
 * Uses `withAdminBypass` because `impersonation` is FORCE-RLS.
 */
export async function getActiveImpersonation(): Promise<ImpersonationState | null> {
  const ctx = await requireAdminSession()

  const rows = await withAdminBypass((db) =>
    db
      .select({
        id: impersonation.id,
        actor_user_id: impersonation.actor_user_id,
        target_user_id: impersonation.target_user_id,
        target_email: app_user.email,
        reason: impersonation.reason,
        started_at: impersonation.started_at,
        expected_end_at: impersonation.expected_end_at,
        ended_at: impersonation.ended_at,
      })
      .from(impersonation)
      .innerJoin(app_user, eq(app_user.id, impersonation.target_user_id))
      .where(
        and(
          eq(impersonation.actor_user_id, ctx.userId),
          isNull(impersonation.ended_at),
          gt(impersonation.expected_end_at, sql`now()`),
        ),
      )
      .orderBy(desc(impersonation.started_at))
      .limit(1),
  )

  const row = rows[0]
  if (!row) return null
  return {
    id: row.id,
    actorUserId: row.actor_user_id,
    targetUserId: row.target_user_id,
    targetEmail: row.target_email,
    reason: row.reason,
    startedAt: row.started_at,
    expectedEndAt: row.expected_end_at,
    endedAt: row.ended_at,
  }
}

/**
 * Server action: start a 30-minute impersonation window.
 *
 *   1. Capability check.
 *   2. Validate reason (>= 8 chars after trim).
 *   3. Validate the target user exists.
 *   3b. When `organizationId` is set (the "Sign in to this org" flow): require
 *       the org to have an ACTIVE support-access grant
 *       (`support_access_expires_at > now()`); refuse otherwise. The grant is
 *       the org's own consent gate — no grant, no sign-in.
 *   4. INSERT `impersonation` row with `expected_end_at = now() + 30min`,
 *      stamping `organization_id` when org-scoped.
 *   5. Best-effort call into Better Auth's admin plugin
 *      (`auth.api.impersonateUser`) to actually swap the live session.
 *      Banner-only flows still work even if the BA call fails — we audit
 *      `admin.user.impersonation_start_failed` and return `ok: false`.
 *   6. Audit `admin.user.impersonation_started` on success.
 */
export async function startImpersonation(
  input: StartImpersonationInput,
): Promise<ImpersonationMutationResult> {
  const ctx = await requireAdminCapability("admin:impersonate")
  await requireStepUpForAction(
    "impersonation.start",
    `/users/${input.targetUserId}/impersonate`,
  )

  const reason = input.reason.trim()
  if (reason.length < MIN_REASON_LENGTH) {
    return {
      ok: false,
      error: `reason must be at least ${MIN_REASON_LENGTH} characters`,
    }
  }

  try {
    await withAdminBypass(async (db) => {
      const target = await db
        .select({ id: app_user.id })
        .from(app_user)
        .where(eq(app_user.id, input.targetUserId))
        .limit(1)
      if (target.length === 0) {
        throw new Error("target user not found")
      }

      // Org-scoped sign-in precondition: the org must currently consent.
      if (input.organizationId) {
        const [org] = await db
          .select({
            granted: sql<boolean>`(${organization.support_access_expires_at} > now())`,
          })
          .from(organization)
          .where(eq(organization.id, input.organizationId))
          .limit(1)
        if (!org || org.granted !== true) {
          throw new Error(
            "organization has not granted support access (no active consent window)",
          )
        }
      }

      await db.insert(impersonation).values({
        workspace_id: ctx.workspaceId,
        organization_id: input.organizationId ?? null,
        actor_user_id: ctx.userId,
        target_user_id: input.targetUserId,
        reason,
        expected_end_at: new Date(Date.now() + IMPERSONATION_TTL_MS),
      })
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "insert failed"
    return { ok: false, error: message }
  }

  // Best-effort: swap the live session via the Better Auth admin plugin.
  try {
    const api = auth.api as unknown as {
      impersonateUser?: (args: { body: { userId: string } }) => Promise<unknown>
    }
    if (typeof api.impersonateUser === "function") {
      await api.impersonateUser({ body: { userId: input.targetUserId } })
    } else {
      console.warn(
        "startImpersonation: auth.api.impersonateUser unavailable on this Better Auth version",
      )
    }
  } catch (err) {
    await auditAdminAction({
      action: "admin.user.impersonation_start_failed",
      payload: {
        target_user_id: input.targetUserId,
        error: err instanceof Error ? err.message : String(err),
      },
    })
    return {
      ok: false,
      error:
        err instanceof Error
          ? err.message
          : "Better Auth impersonateUser failed",
    }
  }

  await auditAdminAction({
    action: "admin.user.impersonation_started",
    organizationId: input.organizationId ?? null,
    payload: {
      target_user_id: input.targetUserId,
      reason,
      organization_id: input.organizationId ?? null,
    },
  })

  return { ok: true }
}

/**
 * Server action: close the most recent active impersonation window for
 * the current staff user. Calls Better Auth `stopImpersonating` best-effort.
 */
export async function stopImpersonation(): Promise<ImpersonationMutationResult> {
  const ctx = await requireAdminCapability("admin:impersonate")

  try {
    await withAdminBypass(async (db) => {
      const row = await db
        .select({ id: impersonation.id })
        .from(impersonation)
        .where(
          and(
            eq(impersonation.actor_user_id, ctx.userId),
            isNull(impersonation.ended_at),
          ),
        )
        .orderBy(desc(impersonation.started_at))
        .limit(1)
      const current = row[0]
      if (!current) return

      await db
        .update(impersonation)
        .set({ ended_at: new Date() })
        .where(eq(impersonation.id, current.id))
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : "update failed"
    return { ok: false, error: message }
  }

  try {
    const api = auth.api as unknown as {
      stopImpersonating?: () => Promise<unknown>
    }
    if (typeof api.stopImpersonating === "function") {
      await api.stopImpersonating()
    } else {
      console.warn(
        "stopImpersonation: auth.api.stopImpersonating unavailable on this Better Auth version",
      )
    }
  } catch (err) {
    console.error("stopImpersonation: Better Auth call failed", err)
  }

  await auditAdminAction({
    action: "admin.user.impersonation_stopped",
    payload: {},
  })

  return { ok: true }
}
