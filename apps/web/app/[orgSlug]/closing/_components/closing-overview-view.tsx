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
import { ProfileIssuesAlert } from "./profile-issues-alert"

const COUNT_ORDER: ClosingObligationStatus[] = [
  "Past due date",
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
  data,
}: {
  data: ClosingObligationsResult
}) {
  if (data.status === "no-access") return null

  const applicableObligations =
    data.status === "ok"
      ? data.obligations.filter((o) => o.applicability.status === "APPLICABLE")
      : []
  const conditionNotEvaluatedCount =
    data.status === "ok"
      ? data.obligations.filter(
          (o) => o.applicability.status === "CONDITION_NOT_EVALUATED",
        ).length
      : 0

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Overview" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <ClosingStatusMessage data={data} />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {data.periodLabel}
              </p>

              <ProfileIssuesAlert issues={data.issues} />

              <div className="flex flex-wrap gap-3">
                {COUNT_ORDER.map((status) => (
                  <Card key={status} className="min-w-32 flex-1 gap-1 p-4">
                    <span className="text-xs text-muted-foreground">
                      {status}
                    </span>
                    <span className="font-heading text-2xl leading-none font-semibold tracking-tight">
                      {
                        // Applicable obligations only. Candidates whose
                        // condition has not been evaluated are surfaced
                        // separately below and do not inflate deadline counts.
                        applicableObligations.filter((o) => o.status === status)
                          .length
                      }
                    </span>
                  </Card>
                ))}
              </div>

              {conditionNotEvaluatedCount > 0 ? (
                <p className="text-xs text-muted-foreground">
                  {conditionNotEvaluatedCount} with condition not evaluated
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
