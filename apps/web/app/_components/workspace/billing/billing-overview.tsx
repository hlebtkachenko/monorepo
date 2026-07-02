"use client"

import Link from "next/link"

import { ContentPanel } from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { toast } from "@workspace/ui/components/sonner"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import {
  BILLING_INVOICES,
  BILLING_USAGE,
  formatInvoiceDate,
  formatMoney,
  planLabel,
} from "./data"

const RECENT_INVOICES = BILLING_INVOICES.slice(0, 3)

/**
 * Billing overview — the Single archetype's plain-panel body (no
 * `RecordWorkspace`, no sticky footer): the real plan (from `workspace.plan`),
 * mock usage tiles, and a peek at the last 3 (mock) invoices with a link into
 * the full invoices route. No portaled header — the nav-derived "Overview"
 * title is correct.
 */
export function BillingOverview({ plan }: { plan: string }) {
  return (
    <ContentPanel>
      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <CardTitle className="text-xl">{planLabel(plan)}</CardTitle>
                <Badge variant="secondary">Current plan</Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast.info("Changing plans is coming soon")}
              >
                Change plan
              </Button>
            </div>
            <CardDescription>Your current subscription.</CardDescription>
          </CardHeader>
        </Card>

        <div className="@container">
          <div className="grid grid-cols-2 gap-3 @2xl:grid-cols-3">
            {BILLING_USAGE.map((u) => (
              <Card key={u.label} size="sm">
                <CardHeader>
                  <CardDescription>{u.label}</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="font-heading text-xl font-semibold tabular-nums @2xl:text-2xl">
                    {u.value}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Recent invoices</CardTitle>
            <CardDescription>Your last billed invoices.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <TableHead>Invoice</TableHead>
                  <TableHead>Date</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {RECENT_INVOICES.map((inv) => (
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
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="mt-3">
              <Button variant="link" size="sm" className="px-0" asChild>
                <Link href="/workspace/billing/invoices">View all →</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </ContentPanel>
  )
}
