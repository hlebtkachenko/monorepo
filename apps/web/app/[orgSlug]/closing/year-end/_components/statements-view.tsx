import type { LayoutLine, StatementUnit } from "@workspace/accounting"
import {
  ContentHeader,
  ContentPanel,
  RecordWorkspace,
} from "@workspace/ui/blocks/app-content"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
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
import type { FinancialStatementsResult } from "../_lib/year-end-data"
import { AnnualStatusMessage } from "../../_components/annual-status-message"
import { AnnualCompletenessAlert } from "../../_components/annual-completeness-alert"

/** One rolled-up statutory rozvaha/VZZ line — indented by its dotted-code depth. */
function LayoutTable({
  title,
  lines,
  unit,
  hasComparative,
}: {
  title: string
  lines: LayoutLine[]
  unit: StatementUnit
  hasComparative: boolean
}) {
  if (lines.length === 0) return null
  return (
    <Card className="p-0">
      <CardHeader className="px-4 pt-4">
        <CardTitle>
          <h3>
            {title}
            {unit === "THOUSANDS" ? " (v tisících Kč)" : ""}
          </h3>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Line</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              {hasComparative ? (
                <TableHead className="text-right">Prior period</TableHead>
              ) : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {lines.map((line) => (
              <TableRow key={line.code}>
                <TableCell
                  style={{ paddingLeft: `${(line.depth - 1) * 20}px` }}
                >
                  {line.code}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatDecimal(line.amount)}
                </TableCell>
                {hasComparative ? (
                  <TableCell className="text-right tabular-nums">
                    {line.comparativeAmount == null
                      ? "Not available"
                      : formatDecimal(line.comparativeAmount)}
                  </TableCell>
                ) : null}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}

/**
 * Draft year-end worksheet from book balances. Missing notes, approval,
 * signature, publication, and unsupported asset columns remain explicit.
 */
export function StatementsView({ data }: { data: FinancialStatementsResult }) {
  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Draft closing worksheet" />
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

              <AnnualCompletenessAlert
                completeness={data.layout.completeness}
              />

              <Card>
                <CardHeader>
                  <CardTitle>
                    <h3>Totals</h3>
                  </CardTitle>
                </CardHeader>
                <CardContent className="flex flex-col gap-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Aktiva celkem</span>
                    <span className="tabular-nums">
                      {formatDecimal(data.zaverka.aktiva)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Pasiva celkem</span>
                    <span className="tabular-nums">
                      {formatDecimal(data.zaverka.pasiva)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Náklady</span>
                    <span className="tabular-nums">
                      {formatDecimal(data.zaverka.naklady)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">Výnosy</span>
                    <span className="tabular-nums">
                      {formatDecimal(data.zaverka.vynosy)}
                    </span>
                  </div>
                  <div className="flex items-center justify-between font-medium">
                    <span>Výsledek hospodaření</span>
                    <span className="tabular-nums">
                      {formatDecimal(data.zaverka.vysledek)}
                    </span>
                  </div>
                </CardContent>
              </Card>

              <LayoutTable
                title="Rozvaha — Aktiva"
                lines={data.layout.aktiva}
                unit={data.layout.unit}
                hasComparative={data.layout.comparativePeriod != null}
              />
              <LayoutTable
                title="Rozvaha — Pasiva"
                lines={data.layout.pasiva}
                unit={data.layout.unit}
                hasComparative={data.layout.comparativePeriod != null}
              />
              <LayoutTable
                title="Výkaz zisku a ztráty"
                lines={data.layout.vzz}
                unit={data.layout.unit}
                hasComparative={data.layout.comparativePeriod != null}
              />

              {data.zaverka.lines.length > 0 ? (
                <Card className="p-0">
                  <CardHeader className="px-4 pt-4">
                    <CardTitle>
                      <h3>Account balances</h3>
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead>Account</TableHead>
                          <TableHead>Nature</TableHead>
                          <TableHead className="text-right">
                            Closing balance
                          </TableHead>
                          <TableHead>Rozvaha line</TableHead>
                          <TableHead>VZZ line</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.zaverka.lines.map((line) => (
                          <TableRow key={line.account_number}>
                            <TableCell>{line.account_number}</TableCell>
                            <TableCell className="text-muted-foreground">
                              {line.nature}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {formatDecimal(line.closing_balance)}
                            </TableCell>
                            <TableCell>
                              {line.balance_sheet_line ?? "—"}
                            </TableCell>
                            <TableCell>
                              {line.income_statement_line ?? "—"}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-6 text-sm text-muted-foreground">
                    No account balances for this period.
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </RecordWorkspace>
      </ContentPanel>
    </>
  )
}
