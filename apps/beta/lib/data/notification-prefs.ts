import "server-only"

import { and, asc, eq, inArray, isNull, ne, or } from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  app_user,
  organization_membership,
  payroll_employee,
  type BetaOrgRole,
} from "@/db/schema"

/**
 * The per-user email notification toggle (spec §2.10, §2.11 — migration 0012)
 * and the recipient resolution every notification event (`lib/notifications/
 * events.ts`) reads before sending anything.
 *
 * ACCOUNT-SCOPED, NOT ORG-SCOPED. `setEmailNotificationsEnabled` takes a bare
 * `userId`, not an `OrgScope` — the toggle is one flag on `app_user`
 * (migration 0012's own header), so there is nothing organization-shaped to
 * gate it with. The caller (a future Nastavení › Účet Server Action, PR 21/22)
 * is expected to have already proven the caller IS that user, the same way
 * `requireBetaSession()` proves it for every other account-level read.
 */

/** Read the signed-in user's own preference — Nastavení › Účet's initial
 * render (PR 21/22's mount point; see `app/_components/email-notifications-
 * toggle.tsx`). */
export async function emailNotificationsEnabled(
  userId: string,
): Promise<boolean> {
  const [row] = await betaDb()
    .select({ enabled: app_user.email_notifications_enabled })
    .from(app_user)
    .where(eq(app_user.id, userId))
    .limit(1)

  // A user id that does not resolve (never reachable from a real session, but
  // this function takes a bare string) reads as the default rather than
  // throwing — the same fail-open-to-the-default shape `readBaseUrl` and
  // friends use for an absent env value, because "unknown user" is not this
  // function's question to answer.
  return row?.enabled ?? true
}

/** The Nastavení › Účet write. A plain literal Drizzle payload — see migration
 * 0012's own header for why this column needs no audited payload builder. */
export async function setEmailNotificationsEnabled(
  userId: string,
  enabled: boolean,
): Promise<void> {
  await betaDb()
    .update(app_user)
    .set({ email_notifications_enabled: enabled })
    .where(eq(app_user.id, userId))
}

export type NotificationRecipient = {
  readonly userId: string
  readonly email: string
}

/**
 * Which active members of an organization may receive an email notification
 * right now — the recipient matrix behind all three spec §2.11 events.
 *
 * `owner` IS THE SENDER, NEVER A RECIPIENT. `owner` is the accounting office
 * (`db/schema/_enums.ts`), and every one of the three events is the office
 * telling the CLIENT something happened (a document was returned, a task was
 * assigned, a period was published) — so this reads the client side of the
 * membership: `admin` (Majitel společnosti), `member` (Pracovník firmy),
 * `guest` (Host, spec §5's external viewer).
 *
 * THE EMPLOYEE SEAT IS EXCLUDED, AND THIS COMMENT USED TO PROMISE IT WOULD BE.
 * The version this replaces said "nothing in this migration's schema links a
 * membership to an employee row yet … the day PR 32 adds the link, this is the
 * one place that exclusion joins in". The link landed (migration 0016's
 * `payroll_employee.app_user_id`, bound by the seat invite of PR 33) and the
 * exclusion did not join in — which left every employee seat on the recipient
 * list for all three events, by virtue of being a `guest`.
 *
 * That is a leak with no page behind it. §2.6.1 gives a seat three surfaces and
 * none of them is company-wide, yet "období bylo publikováno" and "dokument byl
 * vrácen" are exactly the company facts the seat is not admitted to — and an
 * email is a surface that no route gate covers, delivered to a bricklayer's
 * inbox whether or not they ever open the portal. The seat is the ONE guest that
 * is not an external viewer of the company's book, so it is the one guest that
 * comes off this list.
 *
 * THE EXCLUSION IS `role = 'guest' AND linked`, NOT `linked`. A `member`
 * (Pracovník firmy) may perfectly well also have a `payroll_employee` row — an
 * office manager who is on the payroll is still management — and dropping every
 * linked account would silently unsubscribe them. The condition below is the SQL
 * spelling of `isEmployeeSeat` (`lib/data/scope.ts`), and it must stay that way:
 * the join is on `(app_user_id, organization_id)` because a person can be an
 * employee of one client and a manager at another, and the partial unique index
 * `payroll_employee (organization_id, app_user_id)` is what keeps it from
 * fanning a recipient out into duplicate rows.
 *
 * FOUR FILTERS, ALL IN THE WHERE CLAUSE: an inactive membership (an
 * offboarded person), a disabled account (`app_user.disabled_at`), the
 * toggle itself (`email_notifications_enabled = false`), and the seat.
 * Filtering in SQL rather than in the caller means a future event added to
 * `lib/notifications/events.ts` gets every exclusion for free by calling this
 * function at all.
 */
export async function notifiableOrgMembers(
  organizationId: string,
): Promise<NotificationRecipient[]> {
  const CLIENT_SIDE_ROLES: readonly BetaOrgRole[] = ["admin", "member", "guest"]

  return betaDb()
    .select({ userId: app_user.id, email: app_user.email })
    .from(organization_membership)
    .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
    .leftJoin(
      payroll_employee,
      and(
        eq(payroll_employee.app_user_id, organization_membership.user_id),
        eq(
          payroll_employee.organization_id,
          organization_membership.organization_id,
        ),
      ),
    )
    .where(
      and(
        eq(organization_membership.organization_id, organizationId),
        eq(organization_membership.active, true),
        inArray(organization_membership.role, CLIENT_SIDE_ROLES),
        isNull(app_user.disabled_at),
        eq(app_user.email_notifications_enabled, true),
        or(
          ne(organization_membership.role, "guest"),
          isNull(payroll_employee.id),
        ),
      ),
    )
    .orderBy(asc(app_user.email))
}
