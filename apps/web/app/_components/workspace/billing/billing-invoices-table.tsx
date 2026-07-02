"use client"

import {
  ContentPanel,
  ContentStatusBar,
} from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { BILLING_INVOICES, formatInvoiceDate, formatMoney } from "./data"

/**
 * Billing invoices — the full (mock) invoice history in a plain `Table`. No
 * pager: the mock dataset is small. No portaled header — the nav-derived
 * "Invoices" title is correct.
 */
export function BillingInvoicesTable() {
  return (
    <ContentPanel
      bodyClassName="flex min-h-0 flex-col p-0"
      statusBar={
        <ContentStatusBar
          left={
            <span>
              {BILLING_INVOICES.length}{" "}
              {BILLING_INVOICES.length === 1 ? "invoice" : "invoices"}
            </span>
          }
        />
      }
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <Table>
          <TableHeader className="sticky top-0 z-10 bg-muted">
            <TableRow className="hover:bg-transparent">
              <TableHead>Invoice</TableHead>
              <TableHead>Date</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {BILLING_INVOICES.map((inv) => (
              <TableRow key={inv.id}>
                <TableCell className="font-medium">{inv.number}</TableCell>
                <TableCell className="text-muted-foreground">
                  {formatInvoiceDate(inv.date)}
                </TableCell>
                <TableCell className="text-right tabular-nums">
                  {formatMoney(inv.amount)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant={inv.status === "Due" ? "default" : "secondary"}
                  >
                    {inv.status}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => toast("Download invoice — coming soon")}
                  >
                    Download
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </ContentPanel>
  )
}
