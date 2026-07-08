import Link from "next/link"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { AppPageHeader } from "../../../../_components/app-page-header"
import type { IncomeTaxLandingResult } from "../_lib/income-tax-data"
import { IncomeTaxStatusMessage } from "./income-tax-status-message"

/**
 * Income tax landing — a launchpad to whichever of Corporation tax (DPPO) or
 * Personal income tax (DPFO) applies to this organization's person type
 * (the counterpart still renders its own honest "not applicable" state if
 * visited directly). Advances (§38a zálohy) needs the prior period's
 * assessed tax, which isn't modeled yet.
 */
export function IncomeTaxLandingView({
  slug,
  data,
}: {
  slug: string
  data: IncomeTaxLandingResult
}) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Income tax" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <IncomeTaxStatusMessage data={data} />
          ) : (
            <div className="flex flex-col gap-4">
              <Link
                href={`/${slug}/closing/income-tax/${data.personType === "LEGAL" ? "dppo" : "dpfo"}`}
                className="block"
              >
                <Card className="h-full transition-colors hover:bg-muted/40">
                  <CardHeader>
                    <CardTitle>
                      <h3>
                        {data.personType === "LEGAL"
                          ? "Corporation tax"
                          : "Personal income tax"}
                      </h3>
                    </CardTitle>
                    <CardDescription>
                      {data.personType === "LEGAL"
                        ? "Daň z příjmů právnických osob — DPPO."
                        : "Daň z příjmů fyzických osob — DPFO."}
                    </CardDescription>
                  </CardHeader>
                </Card>
              </Link>

              <Card>
                <CardContent className="p-6 text-sm text-muted-foreground">
                  Advances (zálohy na daň, §38a) is not yet available — it needs
                  the prior period&apos;s assessed tax, which isn&apos;t modeled
                  yet.
                </CardContent>
              </Card>
            </div>
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
