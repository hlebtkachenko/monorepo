import "server-only"

import { and, asc, eq, inArray, isNull } from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  app_user,
  organization_membership,
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
 * `guest` (Host, spec §5's external viewer). PR 32's employee seat (a `guest`
 * linked to a `payroll_employee` row) narrows what that seat may SEE, not
 * whether it is a plain client-side recipient here — nothing in this
 * migration's schema links a membership to an employee row yet, so there is
 * nothing to exclude on that axis today; the day PR 32 adds the link, this is
 * the one place that exclusion joins in.
 *
 * THREE FILTERS, ALL IN THE WHERE CLAUSE: an inactive membership (an
 * offboarded person), a disabled account (`app_user.disabled_at`), and the
 * toggle itself (`email_notifications_enabled = false`). Filtering in SQL
 * rather than in the caller means a future event added to `lib/notifications/
 * events.ts` gets the exclusion for free by calling this function at all.
 */
export async function notifiableOrgMembers(
  organizationId: string,
): Promise<NotificationRecipient[]> {
  const CLIENT_SIDE_ROLES: readonly BetaOrgRole[] = ["admin", "member", "guest"]

  return betaDb()
    .select({ userId: app_user.id, email: app_user.email })
    .from(organization_membership)
    .innerJoin(app_user, eq(app_user.id, organization_membership.user_id))
    .where(
      and(
        eq(organization_membership.organization_id, organizationId),
        eq(organization_membership.active, true),
        inArray(organization_membership.role, CLIENT_SIDE_ROLES),
        isNull(app_user.disabled_at),
        eq(app_user.email_notifications_enabled, true),
      ),
    )
    .orderBy(asc(app_user.email))
}
