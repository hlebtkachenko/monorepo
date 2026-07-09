import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"

import { AppPageHeader } from "../../../../_components/app-page-header"
import type { PayrollObligationsResult } from "../_lib/payroll-data"
import { ClosingStatusMessage } from "../../_components/closing-status-message"
import { ObligationsTable } from "../../_components/obligations-table"

/**
 * Payroll — the period's real computed payroll obligations (social
 * insurance, health insurance, withholding tax), sourced from
 * `getPayrollObligations` (VAT-independent). No amounts — there is no
 * payroll engine yet, only obligation existence + due date + derived
 * status. An org with no employees on record (or no tax profile set)
 * legitimately shows an empty state, not a placeholder.
 */
export function PayrollView({
  slug,
  data,
}: {
  slug: string
  data: PayrollObligationsResult
}) {
  if (data.status === "no-access") return null

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Payroll" />
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
