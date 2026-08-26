import "server-only"

import { and, asc, eq, isNull } from "drizzle-orm"

import {
  app_user,
  organization,
  organization_membership,
  type BetaOrgRole,
} from "@/db/schema"
import { mayChangeRole } from "@/lib/auth/invite-policy"
import { guardRefusal, isDeadlock } from "@/lib/pg-error"

import { officeMemberRow, type OfficeMemberRow } from "../projections"
import type { OfficeScope } from "../scope"

import { officeDb } from "./db"

/**
 * Memberships as the office manages them: the per-organization grid and the
 * cross-org "owner ve všech" (spec §3.5).
 *
 * WHAT THIS LAYER ENFORCES AND WHAT IT DOES NOT. It enforces the invite matrix
 * through `mayChangeRole` (`lib/auth/invite-policy.ts`), which is the same
 * matrix Nastavení › Lidé will read from the organization side. It does NOT
 * re-implement the ownership invariants: "an organization keeps at least one
 * owner" and "owner requires office staff" are database triggers, they hold
 * against every writer including a psql session, and duplicating them here
 * would create a second version to drift. What this layer does instead is
 * TRANSLATE their refusals — `guardRefusal` turns a `check_violation` into a
 * named reason the office user can act on, rather than a 500.
 *
 * MEMBERSHIPS ARE NEVER DELETED, only deactivated. `active = false` is what
 * `requireScope` reads, it survives the person coming back, and it keeps
 * `invited_by_user_id` as a record of who let them in. A DELETE would also fire
 * the last-owner guard's DELETE arm for no reason.
 */

export type MembershipRefusal =
  /** No such membership in that organization. */
  | "not_found"
  /** The invite matrix says no — an admin reaching for owner is the live case. */
  | "role_not_allowed"
  /** Would leave the organization with no owner (DB trigger). */
  | "last_owner"
  /** The target is not office staff, so cannot hold owner (DB trigger). */
  | "owner_requires_staff"
  /** The target IS office staff but the account is deactivated (0003). */
  | "owner_requires_active"
  /**
   * Postgres broke a lock cycle and picked this transaction as the victim.
   * Nothing was wrong with the request; the next attempt is expected to work.
   */
  | "retry"
  /** Some other guard refused. */
  | "rejected"

export type MembershipWriteResult =
  { ok: true } | { ok: false; reason: MembershipRefusal }

export async function listOrganizationMembers(
  office: OfficeScope,
  organizationId: string,
): Promise<OfficeMemberRow[]> {
  const rows = await officeDb(office)
    .select({
      user_id: organization_membership.user_id,
      name: app_user.name,
      email: app_user.email,
      role: organization_membership.role,
      active: organization_membership.active,
      is_staff: app_user.is_staff,
      disabled_at: app_user.disabled_at,
    })
    .from(organization_membership)
    .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
    .where(eq(organization_membership.organization_id, organizationId))
    .orderBy(asc(app_user.email))

  return rows.map((row) => officeMemberRow(row))
}

export async function changeMembershipRole(
  office: OfficeScope,
  input: {
    organizationId: string
    targetUserId: string
    nextRole: BetaOrgRole
  },
): Promise<MembershipWriteResult> {
  const db = officeDb(office)

  const [current] = await db
    .select({ role: organization_membership.role })
    .from(organization_membership)
    .where(
      and(
        eq(organization_membership.organization_id, input.organizationId),
        eq(organization_membership.user_id, input.targetUserId),
      ),
    )
    .limit(1)

  if (!current) return { ok: false, reason: "not_found" }
  if (current.role === input.nextRole) return { ok: true }

  if (
    !mayChangeRole(
      { kind: "office" },
      {
        issuerUserId: office.userId,
        targetUserId: input.targetUserId,
        currentRole: current.role,
        nextRole: input.nextRole,
      },
    )
  ) {
    return { ok: false, reason: "role_not_allowed" }
  }

  return writeMembership(() =>
    db
      .update(organization_membership)
      .set({ role: input.nextRole })
      .where(
        and(
          eq(organization_membership.organization_id, input.organizationId),
          eq(organization_membership.user_id, input.targetUserId),
        ),
      ),
  )
}

/**
 * Deactivate or reactivate one membership.
 *
 * Deactivating also revokes that person's outstanding invitations into THIS
 * organization — Advisor carry-in SF-6. That happens in the database, in the
 * trigger `organization_membership_deactivation_revokes_setup_tokens`
 * (migration 0002), not here: /admin is not the only writer that deactivates a
 * membership, and a revocation the office side could forget is a revocation
 * that will eventually be forgotten. See the migration header for the full
 * argument.
 */
export async function setMembershipActive(
  office: OfficeScope,
  input: { organizationId: string; targetUserId: string; active: boolean },
): Promise<MembershipWriteResult> {
  const db = officeDb(office)

  const [current] = await db
    .select({ active: organization_membership.active })
    .from(organization_membership)
    .where(
      and(
        eq(organization_membership.organization_id, input.organizationId),
        eq(organization_membership.user_id, input.targetUserId),
      ),
    )
    .limit(1)

  if (!current) return { ok: false, reason: "not_found" }
  if (current.active === input.active) return { ok: true }

  return writeMembership(() =>
    db
      .update(organization_membership)
      .set({ active: input.active })
      .where(
        and(
          eq(organization_membership.organization_id, input.organizationId),
          eq(organization_membership.user_id, input.targetUserId),
        ),
      ),
  )
}

export type GrantOwnerEverywhereResult =
  | { ok: true; organizationCount: number }
  | { ok: false; reason: MembershipRefusal }

/**
 * "Owner ve všech" (spec §3.5) — seat one office account as owner of every live
 * book in one click.
 *
 * The alternative is the drift the Advisor warned about in Part 4: there is no
 * staff bypass in `requireScope`, so an accountant with no membership sees a
 * 404 on their own client's book, and a per-organization grant list is a
 * checklist somebody will half-finish. Archived organizations are skipped —
 * granting into a withdrawn book would resurrect nothing and only muddies the
 * grid.
 *
 * An EXISTING membership is promoted rather than left alone: the whole point of
 * the button is "this person is the accountant here", and a stale `guest` row
 * from an earlier arrangement is exactly what it is meant to fix. Both arms run
 * in one statement, so the target either owns everything live or owns nothing
 * new.
 */
export async function grantOwnerInAllOrganizations(
  office: OfficeScope,
  targetUserId: string,
): Promise<GrantOwnerEverywhereResult> {
  const db = officeDb(office)

  const [target] = await db
    .select({ is_staff: app_user.is_staff, disabled_at: app_user.disabled_at })
    .from(app_user)
    .where(eq(app_user.id, targetUserId))
    .limit(1)

  if (!target) return { ok: false, reason: "not_found" }
  // Checked here as well as by the trigger so the office user is told which
  // precondition failed instead of watching the whole batch refuse — and told
  // WHICH one: "not office staff" and "office account, but deactivated" have
  // different fixes.
  if (!target.is_staff) return { ok: false, reason: "owner_requires_staff" }
  if (target.disabled_at !== null) {
    return { ok: false, reason: "owner_requires_active" }
  }

  // THIS IS THE APP'S ONE BATCH WRITE, and the reason the lock-order note in
  // migration 0003 says a batch must sort. The INSERT below touches every live
  // organization's membership rows in the order these ids come back, so two
  // concurrent "owner ve všech" runs for two different accountants would
  // otherwise take the same row locks in whatever order the planner happened to
  // return — a lock cycle, and a deadlock for one of them. Ascending id is an
  // arbitrary but TOTAL order, which is all a deadlock-free protocol needs.
  const live = await db
    .select({ id: organization.id })
    .from(organization)
    .where(isNull(organization.archived_at))
    .orderBy(asc(organization.id))

  if (live.length === 0) return { ok: true, organizationCount: 0 }

  const result = await writeMembership(() =>
    db
      .insert(organization_membership)
      .values(
        live.map((row) => ({
          organization_id: row.id,
          user_id: targetUserId,
          role: "owner" as const,
          invited_by_user_id: office.userId,
        })),
      )
      .onConflictDoUpdate({
        target: [
          organization_membership.user_id,
          organization_membership.organization_id,
        ],
        set: { role: "owner", active: true },
      }),
  )

  return result.ok
    ? { ok: true, organizationCount: live.length }
    : { ok: false, reason: result.reason }
}

/**
 * Run a membership write and turn a guard's refusal into a named reason.
 *
 * Only `check_violation` is translated. Anything else is a real fault and is
 * re-thrown: swallowing it would turn a broken database into a polite Czech
 * sentence, which is the worst possible way to learn about one.
 */
async function writeMembership(
  write: () => PromiseLike<unknown>,
): Promise<MembershipWriteResult> {
  try {
    await write()
    return { ok: true }
  } catch (error) {
    // A deadlock is not a refusal and not a fault — the database picked this
    // transaction as the victim of a lock cycle. Answering it as a 500 would
    // tell the office the server is broken when the next click would succeed.
    if (isDeadlock(error)) return { ok: false, reason: "retry" }

    const refusal = guardRefusal(error)
    if (refusal === "last_owner") return { ok: false, reason: "last_owner" }
    if (refusal === "owner_requires_staff") {
      return { ok: false, reason: "owner_requires_staff" }
    }
    if (refusal === "owner_requires_active") {
      return { ok: false, reason: "owner_requires_active" }
    }
    if (refusal !== null) return { ok: false, reason: "rejected" }
    throw error
  }
}
