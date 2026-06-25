"use client"

import { usePathname } from "next/navigation"
import {
  AppSidebar,
  InsightMedia,
  type SidebarFooterLink,
  type SidebarNavEntry,
  type SidebarReminder,
} from "@workspace/ui/blocks/app-sidebar"

/**
 * Org-surface sidebar body. Supplies the data for the AppSidebar block
 * (sections 2–5) and feeds the live pathname for active state. Reminders +
 * insight are mock for now — enough to exercise the dismissal mechanism and
 * the layout until the real data sources are wired.
 */
export function OrgSidebar({
  orgSlug,
  nav,
}: {
  orgSlug: string
  nav: SidebarNavEntry[]
}) {
  const pathname = usePathname()
  const base = `/${orgSlug}`

  // System reminders (mock). Dismissal persists per-org via remindersStorageKey.
  const reminders: SidebarReminder[] = [
    {
      id: "vat-return-q4",
      kind: "action",
      title: "VAT return due",
      description: "Your Q4 VAT return is due in 3 days.",
      actionLabel: "File",
    },
    {
      id: "dph-threshold-2026",
      kind: "info",
      title: "Approaching the DPH threshold",
      description:
        "You're nearing the turnover limit for mandatory VAT registration.",
      href: "https://example.com/dph",
    },
  ]

  const footer: SidebarFooterLink[] = [
    { icon: "Settings", label: "Module settings", href: `${base}/settings` },
    { icon: "CircleHelp", label: "Help", href: `${base}/help` },
  ]

  return (
    <AppSidebar
      currentPath={pathname ?? undefined}
      reminders={reminders}
      remindersStorageKey={orgSlug}
      nav={nav}
      footer={footer}
      // MOCK: one Insight template. The real surface feeds a single insight
      // per context (promo / checklist / trial) from the insight source;
      // swap the template + props, or pass `undefined` to hide the section.
      // The other templates (InsightChecklist, InsightProgress) stay available
      // from @workspace/ui/blocks/app-sidebar. See
      // docs/runbooks/APP-SHELL-PANELS.md.
      insight={
        <InsightMedia
          title="New: reconciliation view"
          description="Match bank lines to invoices in one pass: suggested matches, bulk actions, and a faster path to a clean ledger."
        />
      }
    />
  )
}
