import "server-only"

import { and, eq, isNull, sql } from "drizzle-orm"

import {
  organization_membership,
  payroll_employee,
  user_setup_token,
} from "@/db/schema"

import type { OfficeScope } from "../scope"

import { officeDb } from "./db"

/**
 * REVOKING A MIS-BOUND EMPLOYEE SEAT — the remediation half of spec §2.6.1.
 *
 * The seat's link is created once, by consuming a setup token the office
 * pre-bound to a specific `payroll_employee` row, in the one transaction that
 * also creates the account and the guest membership. Migration 0019's header
 * makes the strong claim that goes with that: "no role-write path in this
 * application can touch `payroll_employee.app_user_id` at all", because binding
 * an account to a person is an IDENTITY act and a role is a GRANT, and the two
 * must not share an authorization check. `updatePayrollEmployee` has no arm for
 * the column and the agent ingestion API cannot state it.
 *
 * The claim held, and it left a hole shaped exactly like itself: there was no
 * way to UNDO a binding either. Send the invite to the wrong address, or bind
 * the wrong employee row, and the wrong human has a permanent, unrevocable
 * right to read a named person's payslips. The only NULL-ing path in the whole
 * system was the `ON DELETE SET NULL` cascade from deleting the `app_user` row,
 * which nothing in the application does.
 *
 * SO THE UNBIND IS AN OFFICE ACT, NOT AN OWNER ACT. It takes an `OfficeScope` —
 * /admin, office staff, the same door that mints the identity in the first
 * place — and not the `OwnerScope` that every other payroll write takes. That is
 * the whole point of 0019's argument, applied in the other direction: if an
 * `admin` inside a client company could unbind, then deciding whose payslips an
 * account reads would once again be reachable from the company's own
 * people-management surface, which is the thing the migration went to some
 * length to prevent.
 *
 * IT REVOKES; IT DOES NOT MERELY UNBIND, and the difference is the safety
 * argument. Clearing `app_user_id` on its own would leave the wrong human as a
 * plain `guest` in the book — and spec §5's guest is an EXTERNAL VIEWER of
 * client-visible data, not a blinded one. They would go from reading one
 * person's payslips to reading the company's documents, tasks and filings,
 * which is a strictly worse outcome than the mistake being remediated. So the
 * link and the membership go together, in one transaction.
 *
 * THE MEMBERSHIP DEACTIVATION IS NARROWED TO `guest` ON PURPOSE. A `member`
 * (Pracovník firmy) can perfectly well also be on the payroll — an office
 * manager who draws a salary is still management — and unbinding their payroll
 * link is not a reason to take their portal access away. Only the seat's own
 * role class is touched.
 *
 * WHY NOT DELETE THE MEMBERSHIP. Memberships are never deleted in this
 * application, only deactivated (`lib/data/office/memberships.ts`): `active =
 * false` is what `requireScope` reads, it survives the person coming back, and
 * it keeps `invited_by_user_id` as the record of who let them in — which is
 * precisely the field an incident review of a mis-bound seat wants.
 *
 * AND THE OUTSTANDING INVITES GO WITH IT, IN THE SAME TRANSACTION.
 *
 * Migration 0002's trigger already revokes a deactivated member's outstanding
 * links, and it is not enough here, because it keys on the PERSON and this
 * mistake is about the SEAT. The whole reason a mis-binding happens is that a
 * seat invite went to the wrong address — so the live token pre-bound to this
 * `payroll_employee` is very often addressed to somebody the deactivated
 * membership has nothing to do with. That token survives the trigger, and
 * consuming it re-writes `app_user_id` through the one path that is allowed to
 * (`consumeSetupToken`'s claim is `app_user_id IS NULL OR = me`, and the unbind
 * just made it NULL again). The office would have revoked a seat and handed the
 * next wrong human a working key to the same payslips.
 *
 * So every unconsumed, unrevoked token naming this employee row is revoked
 * alongside the unbind. Expired ones are swept in too: they are already dead,
 * and including them removes the window where a token expires between the read
 * and the write, at the cost of nothing.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export type SeatRevocation =
  | {
      ok: true
      /** The account that no longer reads this employee's payroll. */
      unboundUserId: string
      /** False when the account's membership was not a `guest` seat. */
      membershipDeactivated: boolean
      /**
       * Unconsumed invites naming this employee row that were killed with it,
       * expired ones included — the count that is above zero exactly when a
       * second wrong human could otherwise have walked in.
       */
      revokedInvites: number
    }
  | { ok: false; reason: "unknown_employee" | "not_bound" }

export async function revokeEmployeeSeat(
  office: OfficeScope,
  input: { organizationId: string; payrollEmployeeId: string },
): Promise<SeatRevocation> {
  // A malformed id is the same non-answer an id from another book gets, rather
  // than a Postgres error surfacing as a 500 — and rather than an oracle that
  // tells a caller which uuids are well-formed.
  if (!UUID.test(input.payrollEmployeeId) || !UUID.test(input.organizationId)) {
    return { ok: false, reason: "unknown_employee" }
  }

  return officeDb(office).transaction(async (tx) => {
    // Read and write in ONE transaction: between reading `app_user_id` and
    // clearing it, a concurrent consume of a second pre-bound token cannot slip
    // in and be silently unbound by this call's stale view of the row.
    const [employee] = await tx
      .select({ appUserId: payroll_employee.app_user_id })
      .from(payroll_employee)
      .where(
        and(
          eq(payroll_employee.id, input.payrollEmployeeId),
          // The tenant filter, even though /admin is above organizations: this
          // call names BOTH an organization and an employee, and an employee id
          // from another book must not be revoked by pointing this one at it.
          eq(payroll_employee.organization_id, input.organizationId),
        ),
      )
      .limit(1)

    if (!employee) return { ok: false, reason: "unknown_employee" }

    const unboundUserId = employee.appUserId
    // Not an error — the office asked for a state the row is already in. Said
    // separately from `unknown_employee` because the two mean different things
    // to whoever is remediating.
    if (unboundUserId === null) return { ok: false, reason: "not_bound" }

    await tx
      .update(payroll_employee)
      .set({ app_user_id: null })
      .where(
        and(
          eq(payroll_employee.id, input.payrollEmployeeId),
          eq(payroll_employee.organization_id, input.organizationId),
        ),
      )

    const deactivated = await tx
      .update(organization_membership)
      .set({ active: false })
      .where(
        and(
          eq(organization_membership.organization_id, input.organizationId),
          eq(organization_membership.user_id, unboundUserId),
          eq(organization_membership.role, "guest"),
        ),
      )
      .returning({ userId: organization_membership.user_id })

    // Keyed on the EMPLOYEE ROW, not on the unbound account: the token that
    // caused this mess is the one addressed to the wrong person, and it has no
    // relationship to the membership deactivated above. `revoked_at` is
    // write-once (migration 0001), so the `IS NULL` is a precondition rather
    // than a filter for tidiness.
    const revokedInvites = await tx
      .update(user_setup_token)
      .set({ revoked_at: sql`now()` })
      .where(
        and(
          eq(user_setup_token.organization_id, input.organizationId),
          eq(user_setup_token.payroll_employee_id, input.payrollEmployeeId),
          isNull(user_setup_token.consumed_at),
          isNull(user_setup_token.revoked_at),
        ),
      )
      .returning({ id: user_setup_token.id })

    return {
      ok: true,
      unboundUserId,
      membershipDeactivated: deactivated.length > 0,
      revokedInvites: revokedInvites.length,
    }
  })
}
