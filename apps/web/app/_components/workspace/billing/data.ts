/**
 * Billing view data. The plan and the billing entity are REAL (resolved
 * server-side from `workspace.plan` + `workspace_billing`). Usage figures and
 * the invoice history are MOCK — there is no metering or invoice table yet, so
 * they are static placeholders, matching the org tier's mock maturity.
 */

export interface BillingEntity {
  legalName: string
  taxId: string
  vatId: string
  addressStreet: string
  addressCity: string
  addressZip: string
  country: string
  billingEmail: string
}

export interface InvoiceLine {
  id: string
  number: string
  date: string
  amount: number
  status: "Paid" | "Due"
}

/** MOCK invoice history. Static + deterministic. */
export const BILLING_INVOICES: InvoiceLine[] = [
  {
    id: "i1",
    number: "AF-2026-0006",
    date: "2026-06-01",
    amount: 2900,
    status: "Due",
  },
  {
    id: "i2",
    number: "AF-2026-0005",
    date: "2026-05-01",
    amount: 2900,
    status: "Paid",
  },
  {
    id: "i3",
    number: "AF-2026-0004",
    date: "2026-04-01",
    amount: 2900,
    status: "Paid",
  },
  {
    id: "i4",
    number: "AF-2026-0003",
    date: "2026-03-01",
    amount: 2900,
    status: "Paid",
  },
]

/** MOCK usage figures shown as small tiles. */
export const BILLING_USAGE: { label: string; value: string }[] = [
  { label: "Client books", value: "18 / 25" },
  { label: "Team seats", value: "4 / 5" },
  { label: "Documents this month", value: "1 240" },
]

const money = new Intl.NumberFormat("cs-CZ", {
  style: "currency",
  currency: "CZK",
  maximumFractionDigits: 0,
})

export function formatMoney(value: number): string {
  return money.format(value)
}

const invoiceDate = new Intl.DateTimeFormat("cs-CZ", { dateStyle: "medium" })

export function formatInvoiceDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number)
  if (!y || !m || !d) return iso
  return invoiceDate.format(new Date(y, m - 1, d))
}

export function planLabel(plan: string): string {
  return plan.charAt(0).toUpperCase() + plan.slice(1)
}
