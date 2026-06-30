import type { SidebarNavEntry } from "@workspace/ui/blocks/app-sidebar"

/**
 * Assets module sidebar nav. Derived from `docs/specs/SITEMAP.md` (Assets —
 * fixed assets & inventory, regime-aware). `base` = `/${orgSlug}/assets`.
 *
 * Asset-card tabs (Movements, Účetní/Daňové odpisy, Assigned, …) and the
 * Acquisitions WIP/advances/disposals lenses are body tabs, not nav leaves.
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
        },
        { label: "Small assets", href: `${base}/small-assets`, icon: "Box" },
        {
          label: "Acquisitions & disposals",
          href: `${base}/acquisitions`,
          icon: "PlusCircle",
        },
        { label: "Leasing", href: `${base}/leasing`, icon: "CreditCard" },
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
