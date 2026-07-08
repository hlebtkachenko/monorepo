import Link from "next/link"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { AppPageHeader } from "../../../../_components/app-page-header"
import { ObligationsTable } from "../../_components/obligations-table"
import type { ClosingObligationsResult } from "../../_lib/closing-shared"
import type { VatFilingPeriodsResult } from "../_lib/vat-data"
import { VatStatusMessage } from "./vat-status-message"

const VAT_LINKS = [
  {
    href: "dap",
    title: "VAT return",
    description: "Přiznání k DPH — the filing period's přiznání lines.",
  },
  {
    href: "kh",
    title: "Control statement",
    description: "Kontrolní hlášení — per-counterparty VAT sections.",
  },
  {
    href: "sh",
    title: "EC Sales List",
    description: "Souhrnné hlášení — intra-EU B2B supplies.",
  },
] as const

/**
 * VAT landing — a launchpad to DAP / KH / SH plus the real VAT-category
 * obligations (due dates + status) for the active accounting period, sourced
 * from the same `computeObligations` engine the Closing Overview uses. No
 * mock rows: an org that owes nothing (or isn't a VAT payer) shows an honest
 * empty/status state, not a placeholder.
 */
export function VatOverviewView({
  slug,
  filingPeriods,
  obligations,
}: {
  slug: string
  filingPeriods: VatFilingPeriodsResult
  obligations: ClosingObligationsResult
}) {
  const vatObligations =
    obligations.status === "ok"
      ? obligations.obligations.filter((o) => o.category === "VAT")
      : []

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="VAT" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {filingPeriods.status !== "ok" ? (
            <VatStatusMessage slug={slug} data={filingPeriods} />
          ) : (
            <div className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                {VAT_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={`/${slug}/closing/vat/${link.href}`}
                    className="block"
                  >
                    <Card className="h-full transition-colors hover:bg-muted/40">
                      <CardHeader>
                        <CardTitle>
                          <h3>{link.title}</h3>
                        </CardTitle>
                        <CardDescription>{link.description}</CardDescription>
                      </CardHeader>
                    </Card>
                  </Link>
                ))}
              </div>

              <ObligationsTable
                rows={vatObligations}
                emptyLabel="No VAT obligations for this period."
              />
            </div>
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
