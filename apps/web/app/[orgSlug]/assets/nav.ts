import type { SidebarNavEntry } from "@workspace/ui/blocks/sidebar-panel"

/**
 * Assets module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Assets —
 * fixed assets, inventory & fleet, regime-aware). `base` = `/${orgSlug}/assets`.
 *
 * Fleet (vehicles / trip log / drivers) lives here — vehicles are assets.
 * Asset-card tabs (Movements, Účetní/Daňové odpisy, …) stay per-record detail
 * tabs. `tba: true` = not-yet-built placeholder.
 */
export function assetsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "BriefcaseBusiness", tba: true },
    // AI-prepared commissioning / disposal events awaiting a human's approval.
    {
      label: "Asset approvals",
      href: `${base}/approvals`,
      icon: "ListChecksIcon",
      tba: true,
    },
    {
      // TODO(regime): cash regime → simpler evidence majetku (daňové-only).
      label: "Register",
      pages: [
        {
          label: "Fixed assets",
          href: `${base}/fixed-assets`,
          icon: "Building2",
          tba: true,
          subpages: [
            {
              label: "Intangible assets",
              href: `${base}/fixed-assets/intangible`,
              tba: true,
            },
            {
              label: "Tangible assets",
              href: `${base}/fixed-assets/tangible`,
              tba: true,
            },
            {
              label: "Land & artwork",
              href: `${base}/fixed-assets/land-art`,
              tba: true,
            },
          ],
        },
        {
          label: "Small assets",
          href: `${base}/small-assets`,
          icon: "Box",
          tba: true,
        },
        {
          label: "Acquisitions & disposals",
          href: `${base}/acquisitions`,
          icon: "PlusCircle",
          tba: true,
          subpages: [
            {
              label: "Under construction",
              href: `${base}/acquisitions/wip`,
              tba: true,
            },
            {
              label: "Advances",
              href: `${base}/acquisitions/advances`,
              tba: true,
            },
            {
              label: "Disposals",
              href: `${base}/acquisitions/disposals`,
              tba: true,
            },
          ],
        },
        {
          label: "Leasing",
          href: `${base}/leasing`,
          icon: "CreditCard",
          tba: true,
          subpages: [
            {
              label: "Contracts",
              href: `${base}/leasing/contracts`,
              tba: true,
            },
            {
              label: "Instalments",
              href: `${base}/leasing/instalments`,
              tba: true,
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
          tba: true,
        },
        {
          label: "Inventory count",
          href: `${base}/inventory-count`,
          icon: "ClipboardIcon",
          tba: true,
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
          tba: true,
        },
        {
          label: "Trip log",
          href: `${base}/trip-log`,
          icon: "ListIcon",
          tba: true,
        },
        {
          label: "Drivers",
          href: `${base}/drivers`,
          icon: "CircleUser",
          tba: true,
        },
      ],
    },
  ]
}
