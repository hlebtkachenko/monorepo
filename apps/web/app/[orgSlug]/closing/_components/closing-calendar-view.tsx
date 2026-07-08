"use client"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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
  groupByMonth,
  monthGroupLabel,
  type ClosingObligationsResult,
} from "../_lib/closing-shared"
import { ClosingStatusBadge } from "./closing-status-badge"
import { ClosingStatusMessage } from "./closing-status-message"

/**
 * Closing Calendar — the same real obligation set as the Overview board, as a
 * chronological deadline list grouped by due-date month.
 */
export function ClosingCalendarView({
  slug,
  data,
}: {
  slug: string
  data: ClosingObligationsResult
}) {
  if (data.status === "no-access") return null

  const groups = data.status === "ok" ? groupByMonth(data.obligations) : []

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Calendar" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <ClosingStatusMessage slug={slug} data={data} />
          ) : groups.length > 0 ? (
            <div className="flex flex-col gap-4">
              {groups.map((group) => (
                <Card key={group.monthKey} className="p-0">
                  <CardHeader className="px-4 pt-4">
                    <CardTitle>
                      <h3>{monthGroupLabel(group.monthKey)}</h3>
                    </CardTitle>
                  </CardHeader>
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
                        {group.rows.map((o, i) => (
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
              ))}
            </div>
          ) : (
            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                No statutory obligations for this period.
              </CardContent>
            </Card>
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
