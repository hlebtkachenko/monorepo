"use client"

import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { BetaMessageKey } from "@/i18n/messages"
import { useBetaTranslations } from "@/i18n/translations"
import { clientTaskLinkHref } from "@/lib/client-task-labels"
import type { DeadlineOrigin, UpcomingDeadline } from "@/lib/data/deadlines"
import { FILING_KIND_LABEL_KEY } from "@/lib/filing-labels"
import { formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"

/**
 * "Nejbližší termíny" (spec §2.1 item 2, Advisor F25) — ONE list over three
 * origins, with the origin as a chip and a link back to the module that owns
 * the row.
 *
 * THE CHIP IS THE POINT, not decoration. The same DPH přiznání can be on this
 * list twice — once to file, once to pay (see `lib/data/deadlines.ts` for why
 * that is two acts and not a duplicate) — and without the chip those two rows
 * are indistinguishable. The chip is also what makes a single list legible at
 * all: a client scanning five rows needs to know which ones the state is
 * waiting on and which one their own accountant is.
 *
 * EVERY ROW LINKS SOMEWHERE REAL, or does not link. `deadlineHref` returns null
 * for a task with `link_kind: 'none'`, and the row then renders as plain text
 * rather than as a link to the page it is already on.
 */

const ORIGIN_LABEL_KEY = {
  urad: "prehled.originUrad",
  platba: "prehled.originPlatba",
  ucetni: "prehled.originUcetni",
} as const satisfies Record<DeadlineOrigin, BetaMessageKey>

/**
 * Úřad is the state's own deadline and Platba is money — the two a client
 * cannot afford to miss — so both carry a filled chip; the office's own ask is
 * an outline. `destructive` on an overdue row overrides all three.
 */
const ORIGIN_VARIANT = {
  urad: "secondary",
  platba: "default",
  ucetni: "outline",
} as const satisfies Record<DeadlineOrigin, "secondary" | "default" | "outline">

/**
 * The §2.3 sidebar segments, keyed by family.
 *
 * A SECOND COPY OF `DANE_NAV`'s slugs, and deliberately so: `dane-nav.ts` is
 * the nav model of a page this component does not belong to, and importing a
 * nav array to look one string up would couple Přehled's rendering to Daně a
 * podání's tab ORDER. `dane-nav.test.ts` already asserts those slugs against
 * the routes; this map is checked against the same pgEnum by `satisfies`, so a
 * family added to `beta_filing_family` is a compile error here too.
 */
const DANE_FAMILY_SEGMENT = {
  dph: "dph",
  dan_z_prijmu: "dan-z-prijmu",
  mzdove_odvody: "mzdove-odvody",
  ostatni: "ostatni",
} as const satisfies Record<NonNullable<UpcomingDeadline["family"]>, string>

/**
 * Where a row points back to.
 *
 * `urad` deep-links to its own §2.3 family tab rather than to Souhrn — the
 * client clicked a DPH deadline, so DPH is the page that answers it. `platba`
 * goes to the one page that shows what is owed. A task goes wherever the office
 * pointed it (§3.4's `link_kind`), and nowhere at all when that is `none`:
 * §2.1's "link-through to source modules" is not satisfied by a link back to
 * this page, and a dead link is worse than none.
 */
function deadlineHref(
  orgSlug: string,
  deadline: UpcomingDeadline,
): string | null {
  switch (deadline.origin) {
    case "urad":
      return deadline.family === null
        ? `/${orgSlug}/dane`
        : `/${orgSlug}/dane/${DANE_FAMILY_SEGMENT[deadline.family]}`
    case "platba":
      return `/${orgSlug}/finance/dluhy-a-platby`
    case "ucetni":
      return deadline.linkKind === null || deadline.linkKind === "none"
        ? null
        : clientTaskLinkHref(orgSlug, deadline.linkKind)
  }
}

export function UpcomingDeadlines({
  orgSlug,
  deadlines,
}: {
  orgSlug: string
  deadlines: readonly UpcomingDeadline[]
}) {
  const t = useBetaTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-lg">
          {t("prehled.deadlinesTitle")}
        </CardTitle>
        <CardDescription>{t("prehled.deadlinesHint")}</CardDescription>
      </CardHeader>
      <CardContent>
        {deadlines.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("prehled.deadlinesEmpty")}
          </p>
        ) : (
          <ul className="grid gap-3">
            {deadlines.map((deadline) => {
              const href = deadlineHref(orgSlug, deadline)
              const title =
                deadline.filingKind !== null
                  ? t(FILING_KIND_LABEL_KEY[deadline.filingKind])
                  : (deadline.label ?? "")

              return (
                <li
                  key={deadline.key}
                  className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-subtle pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex min-w-0 flex-wrap items-center gap-2">
                    <Badge
                      variant={
                        deadline.overdue
                          ? "destructive"
                          : ORIGIN_VARIANT[deadline.origin]
                      }
                    >
                      {t(ORIGIN_LABEL_KEY[deadline.origin])}
                    </Badge>
                    <span className="text-sm font-medium">{title}</span>
                    {deadline.overdue ? (
                      <span className="text-xs font-medium text-destructive">
                        {t("prehled.deadlineOverdue")}
                      </span>
                    ) : null}
                  </div>
                  <div className="flex shrink-0 items-baseline gap-3">
                    {deadline.amount !== null ? (
                      <span className="text-sm font-medium tabular-nums">
                        {formatBetaMoney(deadline.amount)}
                      </span>
                    ) : null}
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {formatBetaDate(deadline.dueOn)}
                    </span>
                    {href !== null ? (
                      <Link
                        href={href}
                        className="text-xs font-medium text-primary underline-offset-2 hover:underline"
                      >
                        {t("prehled.deadlineOpen")}
                      </Link>
                    ) : null}
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
