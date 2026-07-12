import Link from "next/link"

import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/content-panel"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { AppPageHeader } from "../../../../_components/app-page-header"

const NOT_YET_AVAILABLE = [
  "Accruals",
  "Provisions",
  "Value adjustments",
  "Deferred tax",
  "Publication",
  "Year close",
] as const

/**
 * Year-end landing — a launchpad to Statements (the only real year-end
 * output built so far). The rest of the year-end close sequence — accruals,
 * provisions, value adjustments, deferred tax, publication, year close —
 * isn't modeled yet.
 */
export function YearEndLandingView({ slug }: { slug: string }) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Year-end" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          <div className="flex flex-col gap-4">
            <Link
              href={`/${slug}/closing/year-end/statements`}
              className="block"
            >
              <Card className="h-full transition-colors hover:bg-muted/40">
                <CardHeader>
                  <CardTitle>
                    <h3>Draft closing worksheet</h3>
                  </CardTitle>
                  <CardDescription>
                    Draft rozvaha and profit-and-loss worksheets for the active
                    accounting period. Notes, approval, signature, and
                    publication are tracked as missing inputs.
                  </CardDescription>
                </CardHeader>
              </Card>
            </Link>

            <Card>
              <CardContent className="p-6 text-sm text-muted-foreground">
                {NOT_YET_AVAILABLE.join(", ")} are not yet available.
              </CardContent>
            </Card>
          </div>
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
