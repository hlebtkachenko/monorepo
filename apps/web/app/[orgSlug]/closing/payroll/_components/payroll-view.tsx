import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/content-panel"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import type { PayrollObligationsResult } from "../_lib/payroll-data"
import { ClosingStatusMessage } from "../../_components/closing-status-message"
import { ObligationsTable } from "../../_components/obligations-table"
import { ProfileIssuesAlert } from "../../_components/profile-issues-alert"

/**
 * Payroll — the period's real computed payroll obligations (social
 * insurance, health insurance, withholding tax), sourced from
 * `getPayrollObligations` (VAT-independent). No amounts — there is no
 * payroll engine yet, only obligation existence + due date + derived
 * status. An org with no employees on record (or no tax profile set)
 * legitimately shows an empty state, not a placeholder.
 */
export function PayrollView({ data }: { data: PayrollObligationsResult }) {
  if (data.status === "no-access") return null

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Payroll" />
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
              <ObligationsTable
                rows={data.obligations}
                emptyLabel="No payroll obligations for this period."
              />
            </div>
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
