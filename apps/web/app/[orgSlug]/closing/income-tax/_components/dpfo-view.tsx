import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/content-panel"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { formatDecimal } from "../../../../_components/_shared/accounting-format"
import type { PersonalIncomeTaxResult } from "../_lib/income-tax-data"
import { AnnualStatusMessage } from "../../_components/annual-status-message"
import { AnnualCompletenessAlert } from "../../_components/annual-completeness-alert"

interface DpfoLine {
  key: "prijmy_danove" | "vydaje_danove" | "zaklad_dane"
  label: string
}

const DPFO_LINES: DpfoLine[] = [
  { key: "prijmy_danove", label: "Daňové příjmy (peněžní deník)" },
  { key: "vydaje_danove", label: "Daňové výdaje (peněžní deník)" },
  { key: "zaklad_dane", label: "Základ daně" },
]

/**
 * Section 7 tax-record worksheet. It contains only book-derived taxable income
 * and expense totals and explicitly does not claim to be a complete DPFO return.
 */
export function DpfoView({ data }: { data: PersonalIncomeTaxResult }) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Section 7 tax-record worksheet" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <AnnualStatusMessage data={data} />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {data.periodLabel}
              </p>

              <AnnualCompletenessAlert completeness={data.dpfo.completeness} />

              <Card className="p-0">
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="hover:bg-transparent">
                        <TableHead>Line</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {DPFO_LINES.map((line) => (
                        <TableRow key={line.key}>
                          <TableCell>{line.label}</TableCell>
                          <TableCell className="text-right tabular-nums">
                            {formatDecimal(data.dpfo[line.key])}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
