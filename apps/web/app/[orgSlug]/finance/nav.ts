import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Finance module sidebar nav. Derived from `docs/specs/SITEMAP.md`
 * (Finance — cash-flow, "real money"). `base` = `/${orgSlug}/finance`.
 *
 * Debtors/Creditors are by-partner lenses (tabs) on Receivables/Payables, not
 * nav leaves; Bank/Loans movement·statement·reconciliation are body tabs too.
 */
export function financeNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "ReceiptEuro" },
    {
      label: "Treasury",
      pages: [
        { label: "Bank", href: `${base}/bank`, icon: "Building2" },
        { label: "Cash", href: `${base}/cash`, icon: "Banknote" },
        { label: "Loans", href: `${base}/loans`, icon: "PiggyBank" },
      ],
    },
    {
      label: "Receivables & payables",
      pages: [
        {
          label: "Receivables",
          href: `${base}/receivables`,
          icon: "ArrowDown",
        },
        { label: "Payables", href: `${base}/payables`, icon: "ArrowUp" },
      ],
    },
    {
      label: "Collections",
      pages: [
        { label: "Dunning", href: `${base}/dunning`, icon: "Mail" },
        {
          label: "Penalization",
          href: `${base}/penalization`,
          icon: "AlertTriangle",
        },
      ],
    },
    {
      label: "Payments",
      pages: [
        {
          label: "Payment orders",
          href: `${base}/payment-orders`,
          icon: "Send",
        },
        {
          label: "Settlements",
          href: `${base}/settlements`,
          icon: "ArrowUpDown",
        },
        {
          label: "Bulk reconciliation",
          href: `${base}/reconciliation`,
          icon: "RefreshCw",
        },
        {
          label: "Calculators",
          href: `${base}/calculators`,
          icon: "Calculator",
        },
      ],
    },
  ]
}
