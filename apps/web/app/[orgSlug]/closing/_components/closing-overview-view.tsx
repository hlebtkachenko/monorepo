"use client"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import { Card } from "@workspace/ui/components/card"

import { AppPageHeader } from "../../../_components/app-page-header"
import type {
  ClosingObligationStatus,
  ClosingObligationsResult,
} from "../_lib/closing-shared"
import { ClosingStatusMessage } from "./closing-status-message"
import { ObligationsTable } from "./obligations-table"

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

              <ObligationsTable
                rows={data.obligations}
                emptyLabel="No statutory obligations for this period."
              />
            </div>
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
