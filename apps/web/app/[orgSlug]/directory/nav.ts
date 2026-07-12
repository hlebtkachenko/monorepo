import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

/**
 * Directory module sidebar nav (workspace-shared registries). Derived from
 * `docs/specs/SITEMAP.md`. `base` = `/${orgSlug}/directory`. Depth-3.
 *
 * `tba: true` = not-yet-built placeholder; remove when the real body ships.
 */
export function directoryNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "BookUser", tba: true },
    {
      label: "Registers",
      pages: [
        {
          label: "Counterparties",
          href: `${base}/counterparties`,
          icon: "Building2",
          tba: true,
          subpages: [
            {
              label: "Customers",
              href: `${base}/counterparties/customers`,
              tba: true,
            },
            {
              label: "Suppliers",
              href: `${base}/counterparties/suppliers`,
              tba: true,
            },
          ],
        },
        {
          label: "Contacts",
          href: `${base}/contacts`,
          icon: "User",
          tba: true,
        },
        {
          label: "Activities",
          href: `${base}/activities`,
          icon: "Activity",
          tba: true,
        },
        {
          label: "Contracts",
          href: `${base}/contracts`,
          icon: "FileText",
          tba: true,
          subpages: [
            {
              label: "Customer",
              href: `${base}/contracts/customer`,
              tba: true,
            },
            {
              label: "Supplier",
              href: `${base}/contracts/supplier`,
              tba: true,
            },
          ],
        },
        {
          label: "Institutions",
          href: `${base}/institutions`,
          icon: "Globe",
          tba: true,
          subpages: [
            {
              label: "Tax office",
              href: `${base}/institutions/financial-office`,
              tba: true,
            },
            {
              label: "Social security",
              href: `${base}/institutions/social-security`,
              tba: true,
            },
            {
              label: "Health insurers",
              href: `${base}/institutions/health-insurers`,
              tba: true,
            },
            {
              label: "Customs",
              href: `${base}/institutions/customs`,
              tba: true,
            },
            {
              label: "Commercial register",
              href: `${base}/institutions/justice`,
              tba: true,
            },
            {
              label: "Data box",
              href: `${base}/institutions/data-box`,
              tba: true,
            },
          ],
        },
        {
          label: "Banks",
          href: `${base}/banks`,
          icon: "Banknote",
          tba: true,
        },
      ],
    },
  ]
}
