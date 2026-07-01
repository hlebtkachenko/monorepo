import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Accounting module sidebar nav. Derived from `docs/specs/SITEMAP.md`. `base` =
 * `/${orgSlug}/accounting`. Depth-3: Group › Page › Subpage.
 *
 * `badge: "TBA"` marks a page as a not-yet-built placeholder. Remove the badge
 * when the page's real body ships — grep `badge: "TBA"` across the nav to list
 * everything still outstanding.
 */
export function accountingNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Calculator", badge: "TBA" },
    // "Posting approvals" = the queue where the AI Assistant's automatically
    // prepared postings wait for a human to review + approve them (the AI→human
    // schvalovací cesta / approval path).
    {
      label: "Posting approvals",
      href: `${base}/approvals`,
      icon: "ListChecksIcon",
      badge: "TBA",
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
          badge: "TBA",
        },
        {
          label: "Journal",
          href: `${base}/journal`,
          icon: "BookOpen",
          badge: "TBA",
        },
        {
          label: "General ledger",
          href: `${base}/ledger`,
          icon: "BookOpenText",
          badge: "TBA",
        },
        {
          label: "Off-balance ledger",
          href: `${base}/off-balance`,
          icon: "BookmarkIcon",
          badge: "TBA",
        },
        {
          label: "Analytical ledger",
          href: `${base}/analytical`,
          icon: "ListIcon",
          badge: "TBA",
        },
        {
          label: "Trial balance",
          href: `${base}/trial-balance`,
          icon: "BarChart3",
          badge: "TBA",
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
          badge: "TBA",
        },
        {
          label: "Categories",
          href: `${base}/categories`,
          icon: "Box",
          badge: "TBA",
        },
        {
          label: "Posting rules",
          href: `${base}/posting-rules`,
          icon: "Workflow",
          badge: "TBA",
        },
        {
          label: "Posting checks",
          href: `${base}/posting-checks`,
          icon: "CheckCircle2",
          badge: "TBA",
        },
        {
          label: "Opening balances",
          href: `${base}/opening-balances`,
          icon: "Pencil",
          badge: "TBA",
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
          badge: "TBA",
          subpages: [
            {
              label: "Input VAT",
              href: `${base}/vat-ledger/input`,
              badge: "TBA",
            },
            {
              label: "Output VAT",
              href: `${base}/vat-ledger/output`,
              badge: "TBA",
            },
            {
              label: "Reverse charge",
              href: `${base}/vat-ledger/reverse-charge`,
              badge: "TBA",
            },
            {
              label: "Breakdown",
              href: `${base}/vat-ledger/breakdown`,
              badge: "TBA",
            },
            {
              label: "Supporting documents",
              href: `${base}/vat-ledger/supporting-documents`,
              badge: "TBA",
            },
          ],
        },
      ],
    },
  ]
}
