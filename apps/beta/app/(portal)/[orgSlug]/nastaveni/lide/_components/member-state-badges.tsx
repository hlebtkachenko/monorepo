"use client"

import { Badge } from "@workspace/ui/components/badge"

import { useBetaTranslations } from "@/i18n/translations"

/**
 * The three facts an admin needs about one membership BEFORE they click
 * anything: is the seat live, is this the book's last accountant, and is this
 * Host actually one of the company's employees (spec §2.6.1's "Zaměstnanec").
 *
 * A COMPONENT RATHER THAN THREE INLINE TERNARIES IN `page.tsx`, and the reason
 * is the bug this replaced. The seat label first shipped inside the ROLE cell's
 * `assignableRoles.length === 0` branch — which is unreachable for a guest row,
 * because an owner or admin may always re-role a guest, so the select always
 * renders instead. The label therefore never appeared for exactly the rows it
 * existed to mark, and nothing failed: `page.tsx` is an async Server Component
 * that reads the database, so no test in this suite could render it. Pulling the
 * badges out makes the branch a pure function of three booleans, which
 * `lide.test.tsx` renders directly — the seat label is now covered by a test
 * that fails if it disappears.
 *
 * THEY ARE STATES, NOT ROLES. "Zaměstnanec" sits beside "Neaktivní" and
 * "Poslední účetní" because it is the same kind of fact: something true about
 * this membership that changes what deactivating it means. It is deliberately
 * NOT in `ROLE_LABEL_KEY` — see that map's own header for why a fifth label
 * there would have to be either an assignable role (it is not: a seat is created
 * only by consuming a pre-bound link) or a value that renders in one branch and
 * is filtered out of the other.
 */
export function MemberStateBadges({
  active,
  lastOwner,
  employeeSeat,
}: Readonly<{
  active: boolean
  /** The organization's only active owner — the last-owner surface (§2.10). */
  lastOwner: boolean
  /** A `guest` linked to a `payroll_employee` row of this book (§2.6.1). */
  employeeSeat: boolean
}>) {
  const t = useBetaTranslations()

  return (
    <>
      {active ? (
        <Badge variant="secondary">{t("nastaveni.stateActive")}</Badge>
      ) : (
        <Badge variant="outline">{t("nastaveni.stateInactive")}</Badge>
      )}
      {lastOwner ? (
        <Badge variant="outline">{t("nastaveni.stateLastOwner")}</Badge>
      ) : null}
      {employeeSeat ? (
        <Badge variant="outline">{t("nastaveni.roleEmployee")}</Badge>
      ) : null}
    </>
  )
}
