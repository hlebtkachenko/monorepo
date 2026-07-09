"use client"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import { Card, CardContent } from "@workspace/ui/components/card"

import { AppPageHeader } from "../../../_components/app-page-header"
import {
  groupByMonth,
  monthGroupLabel,
  type ClosingObligationsResult,
} from "../_lib/closing-shared"
import { ClosingStatusMessage } from "./closing-status-message"
import { ObligationsTable } from "./obligations-table"

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
                <div key={group.monthKey} className="flex flex-col gap-2">
                  <h3 className="font-heading text-base leading-snug font-medium">
                    {monthGroupLabel(group.monthKey)}
                  </h3>
                  {/* group.rows is always non-empty (groupByMonth never
                      creates an empty group), so the emptyLabel branch below
                      never renders here — kept for a uniform ObligationsTable
                      call across all three closing views. */}
                  <ObligationsTable
                    rows={group.rows}
                    emptyLabel="No statutory obligations for this period."
                  />
                </div>
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
