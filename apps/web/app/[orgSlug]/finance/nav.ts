import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

/**
 * Finance module sidebar nav. Derived from `docs/specs/SITEMAP.md`. `base` =
 * `/${orgSlug}/finance`. Depth-3.
 *
 * `tba: true` = not-yet-built placeholder; remove when the real body ships.
 */
export function financeNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "ReceiptEuro", tba: true },
    // Register of all money accounts (bank accounts + cash points) with balances.
    {
      label: "Accounts",
      href: `${base}/accounts`,
      icon: "CreditCard",
      tba: true,
    },
    {
      label: "Treasury",
      pages: [
        {
          label: "Bank",
          href: `${base}/bank`,
          icon: "Building2",
          tba: true,
          subpages: [
            {
              label: "Movements",
              href: `${base}/bank/movements`,
              tba: true,
            },
            {
              label: "Statements",
              href: `${base}/bank/statements`,
              tba: true,
            },
            {
              label: "Reconciliation",
              href: `${base}/bank/reconciliation`,
              tba: true,
            },
          ],
        },
        {
          label: "Cash in hand",
          href: `${base}/cash`,
          icon: "Banknote",
          tba: true,
        },
        {
          label: "Loans",
          href: `${base}/loans`,
          icon: "PiggyBank",
          tba: true,
          subpages: [
            {
              label: "Movements",
              href: `${base}/loans/movements`,
              tba: true,
            },
            {
              label: "Statements",
              href: `${base}/loans/statements`,
              tba: true,
            },
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
          tba: true,
          subpages: [
            {
              label: "Ageing",
              href: `${base}/receivables/aging`,
              tba: true,
            },
            {
              label: "Debtors",
              href: `${base}/receivables/debtors`,
              tba: true,
            },
          ],
        },
        {
          label: "Payables",
          href: `${base}/payables`,
          icon: "ArrowUp",
          tba: true,
          subpages: [
            { label: "Due", href: `${base}/payables/due`, tba: true },
            {
              label: "Creditors",
              href: `${base}/payables/creditors`,
              tba: true,
            },
          ],
        },
      ],
    },
    {
      label: "Collections",
      pages: [
        {
          label: "Dunning",
          href: `${base}/dunning`,
          icon: "Mail",
          tba: true,
        },
        {
          label: "Penalisation",
          href: `${base}/penalization`,
          icon: "AlertTriangle",
          tba: true,
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
          tba: true,
        },
        {
          label: "Settlements",
          href: `${base}/settlements`,
          icon: "ArrowUpDown",
          tba: true,
          subpages: [
            {
              label: "Bilateral",
              href: `${base}/settlements/bilateral`,
              tba: true,
            },
            {
              label: "Multilateral",
              href: `${base}/settlements/multilateral`,
              tba: true,
            },
          ],
        },
        {
          label: "Bulk reconciliation",
          href: `${base}/reconciliation`,
          icon: "RefreshCw",
          tba: true,
        },
        {
          label: "Calculators",
          href: `${base}/calculators`,
          icon: "Calculator",
          tba: true,
          subpages: [
            { label: "FX", href: `${base}/calculators/fx`, tba: true },
            {
              label: "Penalty",
              href: `${base}/calculators/penalty`,
              tba: true,
            },
            {
              label: "Cash denomination",
              href: `${base}/calculators/cash-denomination`,
              tba: true,
            },
          ],
        },
      ],
    },
  ]
}
