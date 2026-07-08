"use client"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AppPageHeader } from "../../../_components/app-page-header"
import {
  formatIsoDate,
  type ClosingObligationStatus,
  type ClosingObligationsResult,
} from "../_lib/closing-shared"
import { ClosingStatusBadge } from "./closing-status-badge"
import { ClosingStatusMessage } from "./closing-status-message"

const COUNT_ORDER: ClosingObligationStatus[] = [
  "Overdue",
  "Due soon",
  "Upcoming",
]

/**
 * Closing Overview — the period-close cockpit board: the org's REAL computed
 * statutory obligations (VAT return, control statement, EC sales list,
 * payroll remittances) for the active accounting period, sourced from
 * `computeObligations`. No mock rows — an org that owes nothing shows an
 * honest empty state, not a placeholder.
 */
export function ClosingOverviewView({
  slug,
  data,
}: {
  slug: string
  data: ClosingObligationsResult
}) {
  if (data.status === "no-access") return null

  const definiteObligations =
    data.status === "ok" ? data.obligations.filter((o) => !o.conditional) : []
  const conditionalCount =
    data.status === "ok"
      ? data.obligations.length - definiteObligations.length
      : 0

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Overview" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <ClosingStatusMessage slug={slug} data={data} />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {data.periodLabel}
              </p>

              <div className="flex flex-wrap gap-3">
                {COUNT_ORDER.map((status) => (
                  <Card key={status} className="min-w-32 flex-1 gap-1 p-4">
                    <span className="text-xs text-muted-foreground">
                      {status}
                    </span>
                    <span className="font-heading text-2xl leading-none font-semibold tracking-tight">
                      {
                        // Definite obligations only — a conditional row (SH,
                        // identified-person VAT return) only applies IF the
                        // underlying event occurred, so it must not inflate
                        // the headline "due" counts. Surfaced separately below.
                        definiteObligations.filter((o) => o.status === status)
                          .length
                      }
                    </span>
                  </Card>
                ))}
              </div>

              {conditionalCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {conditionalCount} conditional (only if the event occurred)
                </p>
              ) : null}

              {data.obligations.length > 0 ? (
                <Card className="p-0">
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Obligation</TableHead>
                          <TableHead>Period</TableHead>
                          <TableHead>Due</TableHead>
                          <TableHead>Status</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.obligations.map((o, i) => (
                          <TableRow key={`${o.kind}-${o.periodStart}-${i}`}>
                            <TableCell>
                              <div className="flex flex-col gap-0.5">
                                <span>
                                  {o.title}
                                  {o.conditional ? (
                                    <span className="text-muted-foreground">
                                      {" "}
                                      · conditional
                                    </span>
                                  ) : null}
                                </span>
                                {o.conditional && o.note ? (
                                  <span className="text-xs text-muted-foreground">
                                    {o.note}
                                  </span>
                                ) : null}
                              </div>
                            </TableCell>
                            <TableCell className="text-muted-foreground">
                              {o.periodLabel}
                            </TableCell>
                            <TableCell className="tabular-nums">
                              {formatIsoDate(o.dueDate)}
                            </TableCell>
                            <TableCell>
                              <ClosingStatusBadge status={o.status} />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    No statutory obligations for this period.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
