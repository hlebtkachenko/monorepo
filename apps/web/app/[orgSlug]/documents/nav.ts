import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Records (Documents) module sidebar nav. Derived from `docs/specs/SITEMAP.md`
 * (Records — "what's on paper"). `base` = `/${orgSlug}/documents`.
 *
 * Depth-3: each document family is a Page; its Received/Issued (or subtype)
 * splits are Subpages (real routes). Per-record detail tabs stay in the body.
 */
export function documentsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "FolderBookmark" },
    // Distinct from /workspace/inbox (the cross-org task queue): document
    // capture-intake "to classify" queue.
    { label: "Capture inbox", href: `${base}/inbox`, icon: "Inbox" },
    {
      label: "Invoices & vouchers",
      pages: [
        {
          label: "Invoices",
          href: `${base}/invoices`,
          icon: "FileText",
          subpages: [
            { label: "Received", href: `${base}/invoices/received` },
            { label: "Issued", href: `${base}/invoices/issued` },
          ],
        },
        {
          label: "Advances",
          href: `${base}/advances`,
          icon: "FileSpreadsheet",
          subpages: [
            { label: "Received", href: `${base}/advances/received` },
            { label: "Issued", href: `${base}/advances/issued` },
          ],
        },
        {
          label: "Credit & debit notes",
          href: `${base}/credit-notes`,
          icon: "RotateCcw",
          subpages: [
            { label: "Received", href: `${base}/credit-notes/received` },
            { label: "Issued", href: `${base}/credit-notes/issued` },
          ],
        },
        {
          label: "Obligation documents",
          href: `${base}/obligation-vouchers`,
          icon: "ClipboardIcon",
          subpages: [
            { label: "Payable", href: `${base}/obligation-vouchers/payable` },
            {
              label: "Receivable",
              href: `${base}/obligation-vouchers/receivable`,
            },
          ],
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
          subpages: [
            { label: "Internal", href: `${base}/internal-documents/internal` },
            {
              label: "Customs declaration",
              href: `${base}/internal-documents/customs`,
            },
          ],
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
