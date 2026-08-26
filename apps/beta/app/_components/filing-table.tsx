import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { getBetaTranslations } from "@/i18n/translations-server"
import type { BetaMessageKey } from "@/i18n/messages"
import type { FilingView } from "@/lib/data/projections"
import {
  FILING_FAMILY_LABEL_KEY,
  FILING_KIND_LABEL_KEY,
  FILING_STATUS_LABEL_KEY,
} from "@/lib/filing-labels"
import { formatBetaDate } from "@/lib/format/date"
import { formatBetaMoney } from "@/lib/format/money"
import { formatReportingPeriodLabel } from "@/lib/format/period-label"

/**
 * The shared row shape behind every §2.3 surface: the Souhrn timeline, the
 * Souhrn "upcoming" strip, and all four family pages. One table, five call
 * sites — the point being that a column added here (or a bug fixed here)
 * reaches all of them at once, the same reason `filing` is one registry
 * rather than five tables.
 *
 * `showFamily` is on for every cross-family view (Souhrn) and off for a
 * single-family page, where the column would repeat the same badge on every
 * row.
 *
 * PROMOTED HERE FROM `dane/_components/` (PR 31) when Mzdy › Platby a termíny
 * became a SECOND module rendering `mzdove_odvody` filings — the same table,
 * a different family value. Its `dane.*` i18n keys stayed put: the strings
 * they hold ("Podání", "Termín", "Stav", …) are the words for a filing row
 * anywhere it renders, not Daně-specific copy, so renaming them would be
 * churn with no reader-facing change.
 */
export async function FilingTable({
  orgSlug,
  filings,
  showFamily = false,
  emptyMessageKey,
}: {
  orgSlug: string
  filings: readonly FilingView[]
  showFamily?: boolean
  emptyMessageKey: BetaMessageKey
}) {
  const t = await getBetaTranslations()

  if (filings.length === 0) {
    return <p className="text-sm text-muted-foreground">{t(emptyMessageKey)}</p>
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead>{t("dane.columnFiling")}</TableHead>
          {showFamily ? <TableHead>{t("dane.columnFamily")}</TableHead> : null}
          <TableHead>{t("dane.columnPeriod")}</TableHead>
          <TableHead>{t("dane.columnDue")}</TableHead>
          <TableHead>{t("dane.columnFiled")}</TableHead>
          <TableHead className="text-right">{t("dane.columnAmount")}</TableHead>
          <TableHead>{t("dane.columnStatus")}</TableHead>
          <TableHead>{t("dane.columnAttachment")}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filings.map((filing) => {
          const amount = formatBetaMoney(filing.amountDue)
          return (
            <TableRow key={filing.id}>
              <TableCell className="font-medium">
                {t(FILING_KIND_LABEL_KEY[filing.kind])}
              </TableCell>
              {showFamily ? (
                <TableCell>
                  <Badge variant="outline">
                    {t(FILING_FAMILY_LABEL_KEY[filing.family])}
                  </Badge>
                </TableCell>
              ) : null}
              <TableCell>{formatReportingPeriodLabel(filing.period)}</TableCell>
              <TableCell>{formatBetaDate(filing.dueOn)}</TableCell>
              <TableCell>
                {filing.filedOn
                  ? formatBetaDate(filing.filedOn)
                  : t("dane.notFiledYet")}
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {amount ?? t("dane.amountNotStated")}
              </TableCell>
              <TableCell className="space-x-1">
                <Badge
                  variant={
                    filing.status === "planned" ? "outline" : "secondary"
                  }
                >
                  {t(FILING_STATUS_LABEL_KEY[filing.status])}
                </Badge>
                {filing.overdue ? (
                  <Badge variant="destructive">{t("dane.overdueBadge")}</Badge>
                ) : null}
              </TableCell>
              <TableCell>
                {filing.hasAttachment && filing.attachmentDocumentId ? (
                  <Link
                    href={`/api/orgs/${orgSlug}/documents/${filing.attachmentDocumentId}/file`}
                    className="text-sm font-medium text-primary underline-offset-2 hover:underline"
                  >
                    {t("dane.attachmentOpen")}
                  </Link>
                ) : (
                  <span className="text-sm text-muted-foreground">
                    {t("dane.attachmentNone")}
                  </span>
                )}
              </TableCell>
            </TableRow>
          )
        })}
      </TableBody>
    </Table>
  )
}
