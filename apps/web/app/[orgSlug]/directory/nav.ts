import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Directory module sidebar nav (workspace-shared registries). Derived from
 * `docs/specs/SITEMAP.md`. `base` = `/${orgSlug}/directory`.
 *
 * Depth-3: each registry is a Page; role splits (customers/suppliers) and the
 * enumerated Institutions are Subpages — real routes, not body tabs.
 */
export function directoryNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "BookUser" },
    {
      label: "Registers",
      pages: [
        {
          label: "Counterparties",
          href: `${base}/counterparties`,
          icon: "Building2",
          subpages: [
            { label: "Customers", href: `${base}/counterparties/customers` },
            { label: "Suppliers", href: `${base}/counterparties/suppliers` },
          ],
        },
        { label: "Contacts", href: `${base}/contacts`, icon: "User" },
        { label: "Activities", href: `${base}/activities`, icon: "Activity" },
        {
          label: "Contracts",
          href: `${base}/contracts`,
          icon: "FileText",
          subpages: [
            { label: "Customer", href: `${base}/contracts/customer` },
            { label: "Supplier", href: `${base}/contracts/supplier` },
          ],
        },
        {
          label: "Institutions",
          href: `${base}/institutions`,
          icon: "Globe",
          subpages: [
            {
              label: "Finanční úřad",
              href: `${base}/institutions/financial-office`,
            },
            {
              label: "ČSSZ / OSSZ",
              href: `${base}/institutions/social-security`,
            },
            {
              label: "Health insurers",
              href: `${base}/institutions/health-insurers`,
            },
            { label: "Customs", href: `${base}/institutions/customs` },
            { label: "Justice", href: `${base}/institutions/justice` },
            { label: "Data box", href: `${base}/institutions/data-box` },
          ],
        },
        { label: "Banks", href: `${base}/banks`, icon: "Banknote" },
      ],
    },
  ]
}
