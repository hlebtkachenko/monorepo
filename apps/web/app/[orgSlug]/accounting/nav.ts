import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

/**
 * Accounting module sidebar nav. Derived from `docs/specs/SITEMAP.md`. `base` =
 * `/${orgSlug}/accounting`. Depth-3: Group › Page › Subpage.
 *
 * `tba: true` marks a page as a not-yet-built placeholder (renders a muted "TBA"
 * chip, separate from the live `badge` count slot). Remove the flag when the
 * page's real body ships — grep `tba: true` across the nav lists what's left.
 */
export function accountingNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Calculator" },
    // "Posting approvals" = the queue where the AI Assistant's automatically
    // prepared postings wait for a human to review + approve them (the AI→human
    // schvalovací cesta / approval path).
    {
      label: "Posting approvals",
      href: `${base}/approvals`,
      icon: "ListChecksIcon",
    },
    {
      label: "Books",
      pages: [
        // TODO(regime): gate by active accounting_period.regime_code. Cash
        // journal is the primary book for cash regimes (jednoduché / daňová
        // evidence) → shown first; the double-entry books below are hidden then.
        // Double-entry hides Cash journal and leads with Journal.
        {
          label: "Cash journal",
          href: `${base}/cash-journal`,
          icon: "Banknote",
          tba: true,
        },
        {
          label: "Journal",
          href: `${base}/journal`,
          icon: "BookOpen",
        },
        {
          label: "General ledger",
          href: `${base}/ledger`,
          icon: "BookOpenText",
        },
        {
          label: "Saldokonto",
          href: `${base}/saldokonto`,
          icon: "ArrowUpDown",
        },
        {
          label: "Off-balance ledger",
          href: `${base}/off-balance`,
          icon: "BookmarkIcon",
          tba: true,
        },
        {
          label: "Analytical ledger",
          href: `${base}/analytical`,
          icon: "ListIcon",
          tba: true,
        },
        {
          label: "Trial balance",
          href: `${base}/trial-balance`,
          icon: "BarChart3",
        },
      ],
    },
    {
      label: "Structure",
      pages: [
        // TODO(regime): chart-of-accounts is double-entry; categories replaces it for cash.
        {
          label: "Chart of accounts",
          href: `${base}/chart-of-accounts`,
          icon: "Shapes",
        },
        {
          label: "Categories",
          href: `${base}/categories`,
          icon: "Box",
          tba: true,
        },
        {
          label: "Posting rules",
          href: `${base}/posting-rules`,
          icon: "Workflow",
          tba: true,
        },
        {
          label: "Posting checks",
          href: `${base}/posting-checks`,
          icon: "CheckCircle2",
          tba: true,
        },
        {
          label: "Opening balances",
          href: `${base}/opening-balances`,
          icon: "Pencil",
          tba: true,
        },
      ],
    },
    {
      label: "VAT",
      pages: [
        {
          // TODO(regime): gate on vat_status (plátce / IO only).
          label: "VAT ledger",
          href: `${base}/vat-ledger`,
          icon: "FileSpreadsheet",
          tba: true,
          subpages: [
            {
              label: "Input VAT",
              href: `${base}/vat-ledger/input`,
              tba: true,
            },
            {
              label: "Output VAT",
              href: `${base}/vat-ledger/output`,
              tba: true,
            },
            {
              label: "Reverse charge",
              href: `${base}/vat-ledger/reverse-charge`,
              tba: true,
            },
            {
              label: "Breakdown",
              href: `${base}/vat-ledger/breakdown`,
              tba: true,
            },
            {
              label: "Supporting documents",
              href: `${base}/vat-ledger/supporting-documents`,
              tba: true,
            },
          ],
        },
      ],
    },
  ]
}
