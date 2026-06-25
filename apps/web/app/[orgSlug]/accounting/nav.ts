import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Accounting module sidebar nav — pages within the module. Co-located with the
 * routes so adding a page here is a one-line edit next to its folder. `base` is
 * `/${orgSlug}/accounting`; the org-nav aggregator passes it so hrefs stay
 * slug-correct without hardcoding the org.
 */
export function accountingNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "Calculator" },
    { label: "Ledger", href: `${base}/ledger`, icon: "BookOpen" },
    { label: "Journal", href: `${base}/journal`, icon: "FileText" },
    { label: "Posting", href: `${base}/posting`, icon: "Pencil" },
    { label: "Accounts", href: `${base}/accounts`, icon: "ListIcon" },
  ]
}
