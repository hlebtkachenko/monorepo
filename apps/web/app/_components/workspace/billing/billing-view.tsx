"use client"

import * as React from "react"

import { ContentPanel, RecordWorkspace } from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Field, FieldLabel } from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
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
  type BillingEntity,
} from "./data"

function Section({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="mb-4 space-y-0.5">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        {description ? (
          <p className="text-xs text-muted-foreground">{description}</p>
        ) : null}
      </div>
      {children}
    </section>
  )
}

/** The invoice history — a plain table, mounted in the `lineItems` slot. */
function InvoicesTable() {
  return (
    <div className="p-3">
      <div className="mb-2 px-1 text-xs font-medium text-muted-foreground">
        Invoices
      </div>
      <Table>
        <TableHeader>
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
                  variant={inv.status === "Paid" ? "default" : "secondary"}
                >
                  {inv.status}
                </Badge>
              </TableCell>
              <TableCell className="text-right">
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7"
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
  )
}

/**
 * Billing — the Single archetype: a real Plan card + mock usage tiles + the real
 * billing-entity form, with the (mock) invoice history mounted in the line-items
 * region below. `plan` and the billing entity are real; usage + invoices are
 * mock. Save is a stub for v1. No portaled header — the nav-derived "Overview"
 * title is correct.
 */
export function BillingView({
  plan,
  entity,
}: {
  plan: string
  entity: BillingEntity
}) {
  const [form, setForm] = React.useState(entity)
  const set = (key: keyof BillingEntity) => (value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }))
  const dirty = React.useMemo(
    () =>
      (Object.keys(form) as (keyof BillingEntity)[]).some(
        (k) => form[k] !== entity[k],
      ),
    [form, entity],
  )

  return (
    <ContentPanel bodyClassName="flex min-h-0 flex-col p-0">
      <RecordWorkspace
        maxWidth="4xl"
        lineItems={<InvoicesTable />}
        footer={
          <>
            <Button
              variant="ghost"
              size="sm"
              disabled={!dirty}
              onClick={() => setForm(entity)}
            >
              Discard
            </Button>
            <Button
              size="sm"
              disabled={!dirty}
              onClick={() => toast.success("Billing details saved")}
            >
              Save changes
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-5">
          <Section title="Plan" description="Your current subscription.">
            <div className="flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <span className="font-heading text-xl font-semibold">
                  {planLabel(plan)}
                </span>
                <Badge variant="secondary">Current plan</Badge>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => toast("Change plan — coming soon")}
              >
                Change plan
              </Button>
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
              {BILLING_USAGE.map((u) => (
                <div
                  key={u.label}
                  className="rounded-lg border border-border-subtle p-3"
                >
                  <div className="text-xs text-muted-foreground">{u.label}</div>
                  <div className="font-heading text-lg font-semibold tabular-nums">
                    {u.value}
                  </div>
                </div>
              ))}
            </div>
          </Section>

          <Section
            title="Billing entity"
            description="Details printed on invoices."
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="bl-name">Legal name</FieldLabel>
                <Input
                  id="bl-name"
                  value={form.legalName}
                  onChange={(e) => set("legalName")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bl-tax">Tax ID</FieldLabel>
                <Input
                  id="bl-tax"
                  value={form.taxId}
                  onChange={(e) => set("taxId")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bl-vat">VAT ID</FieldLabel>
                <Input
                  id="bl-vat"
                  value={form.vatId}
                  onChange={(e) => set("vatId")(e.target.value)}
                />
              </Field>
              <Field className="sm:col-span-2">
                <FieldLabel htmlFor="bl-street">Street</FieldLabel>
                <Input
                  id="bl-street"
                  value={form.addressStreet}
                  onChange={(e) => set("addressStreet")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bl-city">City</FieldLabel>
                <Input
                  id="bl-city"
                  value={form.addressCity}
                  onChange={(e) => set("addressCity")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bl-zip">ZIP</FieldLabel>
                <Input
                  id="bl-zip"
                  value={form.addressZip}
                  onChange={(e) => set("addressZip")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bl-country">Country</FieldLabel>
                <Input
                  id="bl-country"
                  value={form.country}
                  onChange={(e) => set("country")(e.target.value)}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor="bl-billemail">Billing email</FieldLabel>
                <Input
                  id="bl-billemail"
                  type="email"
                  value={form.billingEmail}
                  onChange={(e) => set("billingEmail")(e.target.value)}
                />
              </Field>
            </div>
          </Section>
        </div>
      </RecordWorkspace>
    </ContentPanel>
  )
}
