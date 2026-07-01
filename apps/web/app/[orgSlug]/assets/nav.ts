import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Assets module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Assets —
 * fixed assets, inventory & fleet, regime-aware). `base` = `/${orgSlug}/assets`.
 *
 * Fleet (vehicles / trip log / drivers) lives here — vehicles are assets.
 * Asset-card tabs (Movements, Účetní/Daňové odpisy, …) stay per-record detail
 * tabs. `badge: "TBA"` = not-yet-built placeholder.
 */
export function assetsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "BriefcaseBusiness", badge: "TBA" },
    // AI-prepared commissioning / disposal events awaiting a human's approval.
    {
      label: "Asset approvals",
      href: `${base}/approvals`,
      icon: "ListChecksIcon",
      badge: "TBA",
    },
    {
      // TODO(regime): cash regime → simpler evidence majetku (daňové-only).
      label: "Register",
      pages: [
        {
          label: "Fixed assets",
          href: `${base}/fixed-assets`,
          icon: "Building2",
          badge: "TBA",
          subpages: [
            {
              label: "Intangible assets",
              href: `${base}/fixed-assets/intangible`,
              badge: "TBA",
            },
            {
              label: "Tangible assets",
              href: `${base}/fixed-assets/tangible`,
              badge: "TBA",
            },
            {
              label: "Land & artwork",
              href: `${base}/fixed-assets/land-art`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Small assets",
          href: `${base}/small-assets`,
          icon: "Box",
          badge: "TBA",
        },
        {
          label: "Acquisitions & disposals",
          href: `${base}/acquisitions`,
          icon: "PlusCircle",
          badge: "TBA",
          subpages: [
            {
              label: "Under construction",
              href: `${base}/acquisitions/wip`,
              badge: "TBA",
            },
            {
              label: "Advances",
              href: `${base}/acquisitions/advances`,
              badge: "TBA",
            },
            {
              label: "Disposals",
              href: `${base}/acquisitions/disposals`,
              badge: "TBA",
            },
          ],
        },
        {
          label: "Leasing",
          href: `${base}/leasing`,
          icon: "CreditCard",
          badge: "TBA",
          subpages: [
            {
              label: "Contracts",
              href: `${base}/leasing/contracts`,
              badge: "TBA",
            },
            {
              label: "Instalments",
              href: `${base}/leasing/instalments`,
              badge: "TBA",
            },
          ],
        },
      ],
    },
    {
      label: "Operations",
      pages: [
        {
          label: "Depreciation run",
          href: `${base}/depreciation-run`,
          icon: "Workflow",
          badge: "TBA",
        },
        {
          label: "Inventory count",
          href: `${base}/inventory-count`,
          icon: "ClipboardIcon",
          badge: "TBA",
        },
      ],
    },
    {
      // Moved from HR: vehicles are assets; trip log + drivers ride with them.
      label: "Fleet",
      pages: [
        {
          label: "Vehicles",
          href: `${base}/vehicles`,
          icon: "Box",
          badge: "TBA",
        },
        {
          label: "Trip log",
          href: `${base}/trip-log`,
          icon: "ListIcon",
          badge: "TBA",
        },
        {
          label: "Drivers",
          href: `${base}/drivers`,
          icon: "CircleUser",
          badge: "TBA",
        },
      ],
    },
  ]
}
