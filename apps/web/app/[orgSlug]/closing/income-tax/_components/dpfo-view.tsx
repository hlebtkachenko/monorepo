import type { Dpfo } from "@workspace/accounting"
import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { AppPageHeader } from "../../../../_components/app-page-header"
import { formatDecimal } from "../../../../_components/_shared/accounting-format"
import type { PersonalIncomeTaxResult } from "../_lib/income-tax-data"
import { IncomeTaxStatusMessage } from "./income-tax-status-message"

interface DpfoLine {
  key: Exclude<keyof Dpfo, "type">
  label: string
}

const DPFO_LINES: DpfoLine[] = [
  { key: "prijmy_danove", label: "Daňové příjmy (peněžní deník)" },
  { key: "vydaje_danove", label: "Daňové výdaje (peněžní deník)" },
  { key: "zaklad_dane", label: "Základ daně" },
]

/**
 * Personal income tax (DPFO — daň z příjmů fyzických osob, §7b ZDP) — the
 * active accounting period's real computed figures from `buildDpfo`.
 * Annual: one computation per period, no filing-period picker (unlike VAT).
 * The full statutory line set renders unconditionally — these are the fixed
 * fields of the DPFO computation, so a zero value is an honest answer, not a
 * fabricated row. Honest "no accounting period" / "not applicable"
 * (legal-entity org) states otherwise.
 */
export function DpfoView({ data }: { data: PersonalIncomeTaxResult }) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Personal income tax" />
      </AppPageHeader>
      <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
        <RecordWorkspace maxWidth="5xl">
          {data.status !== "ok" ? (
            <IncomeTaxStatusMessage data={data} />
          ) : (
            <div className="flex flex-col gap-4">
              <p className="text-sm text-muted-foreground">
                {data.periodLabel}
              </p>

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
