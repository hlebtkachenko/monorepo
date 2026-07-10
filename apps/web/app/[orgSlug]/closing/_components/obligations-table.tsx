import { Card, CardContent } from "@workspace/ui/components/card"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  formatIsoDate,
  type ObligationWithStatus,
} from "../_lib/closing-shared"
import { ClosingStatusBadge } from "./closing-status-badge"

/**
 * Shared Obligation/Period/Due/Status table — identical markup across the
 * Closing Overview, Closing Calendar (per month group), and VAT Overview
 * pages. Presentational only (no "use client", no `server-only`, like
 * `ClosingStatusBadge`), so it renders on both the server (VatOverviewView)
 * and client ("use client" Overview/Calendar views) sides of the boundary.
 */
export function ObligationsTable({
  rows,
  emptyLabel,
}: {
  rows: ObligationWithStatus[]
  emptyLabel: string
}) {
  if (rows.length === 0) {
    return (
      <Card>
        <CardContent className="p-6 text-sm text-muted-foreground">
          {emptyLabel}
        </CardContent>
      </Card>
    )
  }

  return (
    <Card className="p-0">
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              <TableHead>Obligation</TableHead>
              <TableHead>Period</TableHead>
              <TableHead>Due</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((o, i) => (
              <TableRow key={`${o.kind}-${o.periodStart}-${i}`}>
                <TableCell>
                  <div className="flex flex-col gap-0.5">
                    <span>
                      {o.title}
                      {o.applicability.status === "CONDITION_NOT_EVALUATED" ? (
                        <span className="text-muted-foreground">
                          {" · condition not evaluated"}
                        </span>
                      ) : null}
                    </span>
                    {o.applicability.status === "CONDITION_NOT_EVALUATED" ? (
                      <span className="text-xs text-muted-foreground">
                        {o.applicability.reason}
                      </span>
                    ) : null}
                  </div>
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {o.periodLabel}
                </TableCell>
                <TableCell className="tabular-nums">
                  {formatIsoDate(o.dueDate)}
                </TableCell>
                <TableCell>
                  <ClosingStatusBadge status={o.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  )
}
