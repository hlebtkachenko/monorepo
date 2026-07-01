import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Finance module sidebar nav. Derived from `docs/specs/SITEMAP.md`. `base` =
 * `/${orgSlug}/finance`. Depth-3.
 *
 * `badge: "TBA"` = not-yet-built placeholder; remove when the real body ships.
 */
export function financeNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "ReceiptEuro", badge: "TBA" },
    // Register of all money accounts (bank accounts + cash points) with balances.
    {
      label: "Accounts",
      href: `${base}/accounts`,
      icon: "CreditCard",
      badge: "TBA",
    },
    {
      label: "Treasury",
      pages: [
        {
          label: "Bank",
          href: `${base}/bank`,
          icon: "Building2",
          badge: "TBA",
          subpages: [
            {
              label: "Movements",
              href: `${base}/bank/movements`,
              badge: "TBA",
            },
            {
              label: "Statements",
              href: `${base}/bank/statements`,
              badge: "TBA",
            },
            {
              label: "Reconciliation",
              href: `${base}/bank/reconciliation`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Cash in hand",
          href: `${base}/cash`,
          icon: "Banknote",
          badge: "TBA",
        },
        {
          label: "Loans",
          href: `${base}/loans`,
          icon: "PiggyBank",
          badge: "TBA",
          subpages: [
            {
              label: "Movements",
              href: `${base}/loans/movements`,
              badge: "TBA",
            },
            {
              label: "Statements",
              href: `${base}/loans/statements`,
              badge: "TBA",
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
          badge: "TBA",
          subpages: [
            {
              label: "Ageing",
              href: `${base}/receivables/aging`,
              badge: "TBA",
            },
            {
              label: "Debtors",
              href: `${base}/receivables/debtors`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Payables",
          href: `${base}/payables`,
          icon: "ArrowUp",
          badge: "TBA",
          subpages: [
            { label: "Due", href: `${base}/payables/due`, badge: "TBA" },
            {
              label: "Creditors",
              href: `${base}/payables/creditors`,
              badge: "TBA",
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
          badge: "TBA",
        },
        {
          label: "Penalisation",
          href: `${base}/penalization`,
          icon: "AlertTriangle",
          badge: "TBA",
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
          badge: "TBA",
        },
        {
          label: "Settlements",
          href: `${base}/settlements`,
          icon: "ArrowUpDown",
          badge: "TBA",
          subpages: [
            {
              label: "Bilateral",
              href: `${base}/settlements/bilateral`,
              badge: "TBA",
            },
            {
              label: "Multilateral",
              href: `${base}/settlements/multilateral`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Bulk reconciliation",
          href: `${base}/reconciliation`,
          icon: "RefreshCw",
          badge: "TBA",
        },
        {
          label: "Calculators",
          href: `${base}/calculators`,
          icon: "Calculator",
          badge: "TBA",
          subpages: [
            { label: "FX", href: `${base}/calculators/fx`, badge: "TBA" },
            {
              label: "Penalty",
              href: `${base}/calculators/penalty`,
              badge: "TBA",
            },
            {
              label: "Cash denomination",
              href: `${base}/calculators/cash-denomination`,
              badge: "TBA",
            },
          ],
        },
      ],
    },
  ]
}
