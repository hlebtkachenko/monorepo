import "server-only"

import { and, eq } from "drizzle-orm"

import { betaDb } from "@/db/client"
import { payroll_employee } from "@/db/schema"
import { mayInviteEmployeeSeat } from "@/lib/auth/invite-policy"
import {
  issueSetupToken,
  type IssuedSetupLink,
  type IssueSetupTokenRejection,
} from "@/lib/auth/setup-token"

import { payrollScope } from "./payroll"
import type { OrgScope } from "./scope"

/**
 * The employee seat's ISSUANCE half (spec §2.6.1: "invite from employee row →
 * token pre-bound → consume creates user + guest membership + link in one
 * transaction"). The consume half is `lib/auth/setup-token.ts`.
 *
 * WHY IT IS ITS OWN MODULE RATHER THAN A FOURTH FUNCTION IN `people.ts`. Both
 * mint an `org_invite`, but they answer different questions. `people.ts` asks
 * "which ROLE may this issuer grant" and its whole surface is the four-role
 * matrix. This one asks "which PERSON is this account", which is a payroll fact:
 * the input is a `payroll_employee` id, the refusals are about the employee
 * register (unknown row, already has a seat), and the only role it can ever
 * grant is `guest` — pinned by migration 0019's CHECK, not chosen here. Folding
 * it into `inviteMember` would have meant one function whose parameters make two
 * different kinds of decision, and the seat's whole security argument is that
 * those two decisions never share an authorization check.
 *
 * THREE GATES, THEN THE DATABASE:
 *
 *   1. `mayInviteEmployeeSeat` — owner | admin (`invite-policy.ts`). A `member`
 *      reads the whole register but hands out nothing.
 *   2. `payrollScope(scope).kind === "all"` — the caller must be able to SEE the
 *      register they are inviting from. Redundant with (1) for every role that
 *      exists (owner and admin are both management seats), and kept because the
 *      two facts are independent: the day a role can manage people without
 *      seeing payroll, "invite this employee" must not be the read that leaks
 *      the register.
 *   3. The employee row is resolved WITH the tenant filter, so an id from
 *      another book is `unknown_employee` — the same non-oracle answer an
 *      invented uuid gets.
 *
 * and underneath all three, `beta_setup_token_issuer_guard` (an active
 * owner|admin membership in that very organization) plus migration 0019's
 * composite FK (the employee row belongs to the granted organization). Nothing
 * here is the floor.
 */

export type EmployeeSeatInviteRejection =
  /** This issuer does not hand out seats (spec §5: owner | admin). */
  | "not_allowed"
  /** No such employee in THIS organization. Also the cross-org answer. */
  | "unknown_employee"
  /**
   * That employee already has a portal account (spec §2.6.1's partial unique
   * `(organization_id, app_user_id)` is the floor).
   *
   * DISTINGUISHABLE FROM `unknown_employee`, and safely so: the caller is a
   * management seat looking at the register, and `PayrollEmployeeView` already
   * renders `hasPortalAccount` on the very row they clicked. It tells them
   * nothing the page did not.
   */
  | "already_linked"
  /** Whatever `issueSetupToken` refused it for, passed through verbatim. */
  | { readonly issue: IssueSetupTokenRejection }

export type EmployeeSeatInviteResult =
  | { readonly ok: true; readonly link: IssuedSetupLink }
  | { readonly ok: false; readonly reason: EmployeeSeatInviteRejection }

export type EmployeeSeatInviteInput = {
  readonly employeeId: string
  readonly email: string
  readonly ip: string | null
  readonly userAgent: string | null
}

/**
 * Mint a pre-bound seat invite for one employee.
 *
 * THE EMAIL IS NOT VALIDATED HERE. `issueSetupToken` owns the address rule and
 * refuses a bad one before generating anything, so re-checking would be a second
 * opinion about what an email is — the same reason this module does not re-derive
 * the TTL or the token shape either.
 *
 * RE-INVITING IS LEGAL AND IS NOT A SECOND SEAT. An employee who has not yet
 * consumed (`app_user_id` still NULL) can be invited again — a lost email, a
 * typo'd address — and `issueSetupToken` revokes every earlier live invitation
 * naming this employee inside the same transaction as the new INSERT. So the
 * mistyped address stops working the moment the corrected one is issued, rather
 * than racing it to the consume.
 */
export async function inviteEmployeeSeat(
  scope: OrgScope,
  input: EmployeeSeatInviteInput,
): Promise<EmployeeSeatInviteResult> {
  const issuer = { kind: "organization", role: scope.role } as const
  if (!mayInviteEmployeeSeat(issuer)) {
    return { ok: false, reason: "not_allowed" }
  }
  if (payrollScope(scope).kind !== "all") {
    return { ok: false, reason: "not_allowed" }
  }

  const [employee] = await betaDb()
    .select({
      id: payroll_employee.id,
      app_user_id: payroll_employee.app_user_id,
    })
    .from(payroll_employee)
    .where(
      and(
        eq(payroll_employee.id, input.employeeId),
        // The tenant filter. An employee id is never a key on its own here, for
        // the same reason a document id is not in `documents.ts`.
        eq(payroll_employee.organization_id, scope.organizationId),
      ),
    )
    .limit(1)

  if (!employee) return { ok: false, reason: "unknown_employee" }
  if (employee.app_user_id !== null) {
    return { ok: false, reason: "already_linked" }
  }

  const issued = await issueSetupToken({
    purpose: "org_invite",
    email: input.email,
    // FROM THE RESOLVED SCOPE, never from the form — `people.ts`'s own note.
    organizationId: scope.organizationId,
    // NOT A PARAMETER. §2.6.1's seat IS a guest membership, and migration 0019
    // refuses a bound token that grants anything else, so there is nothing for a
    // caller to choose and therefore nothing for a caller to get wrong.
    grantedRole: "guest",
    payrollEmployeeId: employee.id,
    issuer: {
      kind: "organization",
      userId: scope.userId,
      organizationId: scope.organizationId,
      role: scope.role,
    },
    ip: input.ip,
    userAgent: input.userAgent,
  })

  if (!issued.ok) return { ok: false, reason: { issue: issued.reason } }
  return { ok: true, link: issued.link }
}
