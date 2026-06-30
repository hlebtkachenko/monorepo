import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Records (Documents) module sidebar nav. Derived from `docs/specs/SITEMAP.md`
 * (Records — "what's on paper"). `base` = `/${orgSlug}/documents`.
 *
 * Per the page-vs-tab rule, document subtypes (Received/Issued, the named tax-doc
 * subtypes, JSD/customs) are content-header tabs in each page body, NOT nav leaves.
 */
export function documentsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "FolderBookmark" },
    // Distinct from /workspace/inbox (the cross-org task queue): this is the
    // document capture-intake "to classify" queue.
    { label: "Capture inbox", href: `${base}/inbox`, icon: "Inbox" },
    {
      label: "Invoices & vouchers",
      pages: [
        { label: "Invoices", href: `${base}/invoices`, icon: "FileText" },
        {
          label: "Advances",
          href: `${base}/advances`,
          icon: "FileSpreadsheet",
        },
        {
          label: "Credit & debit notes",
          href: `${base}/credit-notes`,
          icon: "RotateCcw",
        },
        {
          label: "Obligation documents",
          href: `${base}/obligation-vouchers`,
          icon: "ClipboardIcon",
        },
      ],
    },
    {
      label: "Other documents",
      pages: [
        {
          label: "Loan documents",
          href: `${base}/loan-documents`,
          icon: "PiggyBank",
        },
        {
          label: "Internal documents",
          href: `${base}/internal-documents`,
          icon: "FileCogIcon",
        },
      ],
    },
    {
      label: "Recurring templates",
      href: `${base}/recurring-templates`,
      icon: "RefreshCw",
    },
  ]
}
