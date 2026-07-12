"use client"

import { ContentHeader, type ViewTab } from "@workspace/ui/blocks/content-panel"

import { useOrgContent } from "./context"
import { INVOICE_TABS } from "./data"

/**
 * TEMP — the Content Panel header for the invoices demo. Mounts into the
 * app-shell `contentHeader` slot. Tabs are controlled by the shared demo
 * context so the body reacts to them. The manage-views (⋯) menu carries the
 * shared mechanism (choose tabs + show-in-section + sort), so this Table demo
 * and the archetype demos stay identical.
 */
export function TableDemoHeader() {
  const { activeTab, setActiveTab, hiddenTabs, toggleTabHidden } =
    useOrgContent()

  const tabs: ViewTab[] = INVOICE_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  return (
    <ContentHeader
      title="Incoming invoices"
      viewTabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageViews={{
        tabs: INVOICE_TABS,
        hidden: hiddenTabs,
        onToggle: toggleTabHidden,
      }}
    />
  )
}
