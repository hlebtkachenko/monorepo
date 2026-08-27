"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableFooter,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useBetaTranslations } from "@/i18n/translations"
import type { ObligationGroupSummary } from "@/lib/data/obligations"
import { formatDate, formatDateTime } from "@/lib/format/date"
import { formatAmount } from "@/lib/format/money"
import {
  obligationTitle,
  OBLIGATION_GROUP_LABEL_KEY,
} from "@/lib/obligation-labels"

/**
 * One creditor group of Dluhy a platby (spec §2.4): a heading, the group's own
 * stamp, its rows in deadline order, and the SQL-computed total under them.
 *
 * A PURE FUNCTION OF ITS PROPS. Everything it needs is already decided — the
 * bucketing, the ordering, the sums and the overdue flags all come out of
 * `obligationsForScope`, the sums as window functions computed by Postgres over
 * exactly these rows. This file adds Czech words and nothing else: no state, no
 * sorting, no filtering, and above all no arithmetic. The moment a number here
 * were computed rather than rendered, the portal would be deriving an
 * accounting fact, which spec §0.2 forbids outright.
 *
 * `"use client"` with no interactivity at all, on purpose — it makes the
 * component renderable through `renderToStaticMarkup` in the `pure` vitest
 * project, which is how `dluhy-a-platby.test.tsx` asserts what a client is
 * actually SHOWN. Same choice PR 12's Dokumenty table made, for the same reason.
 *
 * `total` / `amount` are `numeric(14,2)` STRINGS all the way from Postgres;
 * `formatAmount` is the last step before display and the only place this
 * application turns one into a JavaScript number — see its own header.
 *
 * PROMOTED HERE FROM `finance/dluhy-a-platby/_components/` (PR 31): Mzdy ›
 * Platby a termíny renders the SAME `cssz_zp` group card `obligationsForScope`
 * already produces, and a second consumer is this repo's own rule for moving
 * a component up to `app/_components/` rather than forking it.
 */
export function ObligationGroupCard({
  group,
}: {
  group: ObligationGroupSummary
}) {
  const t = useBetaTranslations()

  return (
    <Card>
      <CardHeader>
        <CardTitle className="font-heading text-base">
          {t(OBLIGATION_GROUP_LABEL_KEY[group.group])}
        </CardTitle>
        <CardDescription>
          {/*
            The §2.4 per-group stamp: the SOURCE's own last edit, not a
            page-render time. A surface that stamps itself with "now" tells the
            client its data is fresh when all that is fresh is the request.
          */}
          {t("finance.asOf")} {formatDateTime(group.asOf)}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("finance.columnTitle")}</TableHead>
              <TableHead>{t("finance.columnDueOn")}</TableHead>
              <TableHead>{t("finance.columnVariableSymbol")}</TableHead>
              <TableHead>{t("finance.columnState")}</TableHead>
              <TableHead className="text-right">
                {t("finance.columnAmount")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {group.obligations.map((obligation) => {
              const title = obligationTitle(obligation)
              return (
                <TableRow key={obligation.key}>
                  <TableCell className="font-medium">
                    {title.kind === "key" ? t(title.value) : title.value}
                  </TableCell>
                  <TableCell>{formatDate(obligation.dueOn)}</TableCell>
                  <TableCell className="font-mono text-xs">
                    {obligation.variableSymbol ?? "—"}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant={obligation.overdue ? "destructive" : "secondary"}
                    >
                      {obligation.overdue
                        ? t("finance.stateOverdue")
                        : t("finance.stateOpen")}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(obligation.amount)}
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell colSpan={4}>{t("finance.groupTotal")}</TableCell>
              <TableCell className="text-right tabular-nums">
                {formatAmount(group.total)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  )
}
