import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Assets module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Assets —
 * fixed assets & inventory, regime-aware). `base` = `/${orgSlug}/assets`.
 *
 * Depth-3: Fixed-assets by class, the acquisition lifecycle lenses, and leasing
 * are Subpages. Asset-card tabs (Movements, Účetní/Daňové odpisy, …) stay
 * per-record detail tabs in the body.
 */
export function assetsNav(base: string): SidebarNavEntry[] {
  return [
    { label: "Overview", href: base, icon: "BriefcaseBusiness" },
    { label: "Review", href: `${base}/review`, icon: "ListChecksIcon" },
    {
      // TODO(regime): cash regime → simpler evidence majetku (daňové-only).
      label: "Register",
      pages: [
        {
          label: "Fixed assets",
          href: `${base}/fixed-assets`,
          icon: "Building2",
          subpages: [
            {
              label: "Intangible assets",
              href: `${base}/fixed-assets/intangible`,
            },
            { label: "Tangible assets", href: `${base}/fixed-assets/tangible` },
            { label: "Land & artwork", href: `${base}/fixed-assets/land-art` },
          ],
        },
        { label: "Small assets", href: `${base}/small-assets`, icon: "Box" },
        {
          label: "Acquisitions & disposals",
          href: `${base}/acquisitions`,
          icon: "PlusCircle",
          subpages: [
            { label: "Under construction", href: `${base}/acquisitions/wip` },
            { label: "Advances", href: `${base}/acquisitions/advances` },
            { label: "Disposals", href: `${base}/acquisitions/disposals` },
          ],
        },
        {
          label: "Leasing",
          href: `${base}/leasing`,
          icon: "CreditCard",
          subpages: [
            { label: "Contracts", href: `${base}/leasing/contracts` },
            { label: "Instalments", href: `${base}/leasing/instalments` },
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
        },
        {
          label: "Inventory count",
          href: `${base}/inventory-count`,
          icon: "ClipboardIcon",
        },
      ],
    },
  ]
}
