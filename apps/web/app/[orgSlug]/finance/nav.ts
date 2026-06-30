import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Finance module sidebar nav. Derived from `docs/specs/SITEMAP.md`
 * (Finance — cash-flow, "real money"). `base` = `/${orgSlug}/finance`.
 *
 * Depth-3: Bank/Loans movement·statement·reconciliation lenses, AR/AP aging vs
 * by-partner, settlement subtypes and the calculators are Subpages (real routes).
 */
export function financeNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "ReceiptEuro" },
    {
      label: "Treasury",
      pages: [
        {
          label: "Bank",
          href: `${base}/bank`,
          icon: "Building2",
          subpages: [
            { label: "Movements", href: `${base}/bank/movements` },
            { label: "Statements", href: `${base}/bank/statements` },
            { label: "Reconciliation", href: `${base}/bank/reconciliation` },
          ],
        },
        { label: "Cash", href: `${base}/cash`, icon: "Banknote" },
        {
          label: "Loans",
          href: `${base}/loans`,
          icon: "PiggyBank",
          subpages: [
            { label: "Movements", href: `${base}/loans/movements` },
            { label: "Statements", href: `${base}/loans/statements` },
          ],
        },
      ],
    },
    {
      label: "Receivables & payables",
      pages: [
        {
          label: "Receivables",
          href: `${base}/receivables`,
          icon: "ArrowDown",
          subpages: [
            { label: "Ageing", href: `${base}/receivables/aging` },
            { label: "Debtors", href: `${base}/receivables/debtors` },
          ],
        },
        {
          label: "Payables",
          href: `${base}/payables`,
          icon: "ArrowUp",
          subpages: [
            { label: "Due", href: `${base}/payables/due` },
            { label: "Creditors", href: `${base}/payables/creditors` },
          ],
        },
      ],
    },
    {
      label: "Collections",
      pages: [
        { label: "Dunning", href: `${base}/dunning`, icon: "Mail" },
        {
          label: "Penalisation",
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
          subpages: [
            { label: "Bilateral", href: `${base}/settlements/bilateral` },
            { label: "Multilateral", href: `${base}/settlements/multilateral` },
          ],
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
          subpages: [
            { label: "FX", href: `${base}/calculators/fx` },
            { label: "Penalty", href: `${base}/calculators/penalty` },
            {
              label: "Cash denomination",
              href: `${base}/calculators/cash-denomination`,
            },
          ],
        },
      ],
    },
  ]
}
