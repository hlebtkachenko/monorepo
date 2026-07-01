import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Directory module sidebar nav (workspace-shared registries). Derived from
 * `docs/specs/SITEMAP.md`. `base` = `/${orgSlug}/directory`. Depth-3.
 *
 * `badge: "TBA"` = not-yet-built placeholder; remove when the real body ships.
 */
export function directoryNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "BookUser", badge: "TBA" },
    {
      label: "Registers",
      pages: [
        {
          label: "Counterparties",
          href: `${base}/counterparties`,
          icon: "Building2",
          badge: "TBA",
          subpages: [
            {
              label: "Customers",
              href: `${base}/counterparties/customers`,
              badge: "TBA",
            },
            {
              label: "Suppliers",
              href: `${base}/counterparties/suppliers`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Contacts",
          href: `${base}/contacts`,
          icon: "User",
          badge: "TBA",
        },
        {
          label: "Activities",
          href: `${base}/activities`,
          icon: "Activity",
          badge: "TBA",
        },
        {
          label: "Contracts",
          href: `${base}/contracts`,
          icon: "FileText",
          badge: "TBA",
          subpages: [
            {
              label: "Customer",
              href: `${base}/contracts/customer`,
              badge: "TBA",
            },
            {
              label: "Supplier",
              href: `${base}/contracts/supplier`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Institutions",
          href: `${base}/institutions`,
          icon: "Globe",
          badge: "TBA",
          subpages: [
            {
              label: "Tax office",
              href: `${base}/institutions/financial-office`,
              badge: "TBA",
            },
            {
              label: "Social security",
              href: `${base}/institutions/social-security`,
              badge: "TBA",
            },
            {
              label: "Health insurers",
              href: `${base}/institutions/health-insurers`,
              badge: "TBA",
            },
            {
              label: "Customs",
              href: `${base}/institutions/customs`,
              badge: "TBA",
            },
            {
              label: "Commercial register",
              href: `${base}/institutions/justice`,
              badge: "TBA",
            },
            {
              label: "Data box",
              href: `${base}/institutions/data-box`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Banks",
          href: `${base}/banks`,
          icon: "Banknote",
          badge: "TBA",
        },
      ],
    },
  ]
}
