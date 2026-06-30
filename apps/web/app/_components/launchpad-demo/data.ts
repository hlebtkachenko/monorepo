import type { LaunchpadSection } from "@workspace/ui/blocks/app-content"

/**
 * Mock launchpad structure for the #425 demo. Exercises every section kind the
 * `LaunchpadGrid` lays out — pinned, single, grouped (with subpages), footer —
 * plus a spread of `unread` counts and a couple of pre-`followed` pages. A real
 * page swaps this for its own nav-derived data; the block is otherwise unchanged.
 */
export const BASE_SECTIONS: LaunchpadSection[] = [
  {
    id: "pinned",
    kind: "pinned",
    label: "Pinned",
    pages: [
      {
        id: "invoices",
        title: "Invoices",
        description: "Received and issued documents, matching and approvals.",
        icon: "FileText",
        href: "#",
        unread: 4,
        featured: true,
        metric: "128 documents · 4 to match",
      },
      {
        id: "bank",
        title: "Bank",
        description: "Accounts, statements, matching.",
        icon: "Banknote",
        href: "#",
      },
      {
        id: "cash",
        title: "Cash",
        description: "Registers and petty cash.",
        icon: "Banknote",
        href: "#",
      },
      {
        id: "taxes",
        title: "Taxes",
        description: "VAT returns and filings.",
        icon: "ReceiptEuro",
        href: "#",
        unread: 2,
      },
    ],
  },
  {
    id: "single",
    kind: "single",
    pages: [
      {
        id: "counterparties",
        title: "Counterparties",
        description: "Customers and suppliers.",
        icon: "Users",
        href: "#",
        followed: true,
      },
      {
        id: "reports",
        title: "Reports",
        description: "VAT, balance, income statement.",
        icon: "BarChart3",
        href: "#",
        unread: 1,
      },
      {
        id: "assets",
        title: "Assets",
        description: "Fixed assets and depreciation.",
        icon: "Building2",
        href: "#",
      },
      {
        id: "payroll",
        title: "Payroll",
        description: "Employees and wages.",
        icon: "Users",
        href: "#",
      },
    ],
  },
  {
    id: "accounting",
    kind: "group",
    label: "Accounting",
    pages: [
      {
        id: "journals",
        title: "Journals",
        description: "Posted entries by book.",
        icon: "BookOpen",
        href: "#",
        subpages: [
          { id: "gl", title: "General ledger", href: "#", unread: 2 },
          { id: "vat", title: "VAT ledger", href: "#" },
        ],
      },
      {
        id: "documents",
        title: "Documents",
        description: "Contracts and attachments.",
        icon: "FolderOpen",
        href: "#",
        followed: true,
        subpages: [
          { id: "contracts", title: "Contracts", href: "#" },
          { id: "attachments", title: "Attachments", href: "#", unread: 5 },
        ],
      },
    ],
  },
  {
    id: "footer",
    kind: "footer",
    label: "More",
    pages: [
      { id: "settings", title: "Settings", icon: "Building2", href: "#" },
      { id: "help", title: "Help", icon: "Bell", href: "#" },
      { id: "activity", title: "Activity log", icon: "Eye", href: "#" },
    ],
  },
]
