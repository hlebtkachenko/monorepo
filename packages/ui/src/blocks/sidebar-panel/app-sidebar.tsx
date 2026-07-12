"use client"

import * as React from "react"

import { SidebarFooter, type SidebarFooterLink } from "./sidebar-footer"
import { SidebarInsight } from "./sidebar-insight"
import { SidebarNav, type SidebarNavEntry } from "./sidebar-nav"
import { SidebarReminders, type SidebarReminder } from "./sidebar-reminders"

export interface AppSidebarProps {
  /** Section 2 — system reminders (optional, dismissable, persisted). */
  reminders?: SidebarReminder[]
  /** Scopes the reminder dismissed-set in localStorage (e.g. per org slug). */
  remindersStorageKey?: string
  onReminderResolve?: (reminder: SidebarReminder) => void
  /** Section 3 — module navigation (flat or grouped). */
  nav: SidebarNavEntry[]
  /** Section 4 — dynamic Insight-card content. Omit to hide the card. */
  insight?: React.ReactNode
  /** Section 5 — standalone, icon-led footer links. */
  footer?: SidebarFooterLink[]
  /** Current route — pass `usePathname()` from the app wrapper. */
  currentPath?: string
}

/**
 * The sidebar panel body (sections 2–5 below the shell-owned 45px header):
 *
 *   2. Reminders — optional, top, no separator of its own.
 *   3. Module nav — fills the free height and scrolls.
 *   4. Insight — Card, pinned just above the footer.
 *   5. Footer — standalone icon links.
 *
 * Every section self-hides when empty, so the layout collapses cleanly to
 * just the nav when nothing else is present.
 */
export function AppSidebar({
  reminders,
  remindersStorageKey = "app",
  onReminderResolve,
  nav,
  insight,
  footer,
  currentPath,
}: AppSidebarProps) {
  return (
    <div data-slot="app-sidebar" className="flex h-full flex-col gap-2 p-2">
      {/* Reminders + nav share ONE scroll region (scroll together); insight +
          footer stay pinned at the bottom. */}
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-x-hidden overflow-y-auto">
        <SidebarReminders
          reminders={reminders ?? []}
          storageKey={remindersStorageKey}
          onResolve={onReminderResolve}
        />
        <SidebarNav entries={nav} currentPath={currentPath} />
      </div>
      <SidebarInsight>{insight}</SidebarInsight>
      <SidebarFooter links={footer ?? []} currentPath={currentPath} />
    </div>
  )
}
