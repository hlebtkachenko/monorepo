"use client"

import { ContentHeader, type ViewTab } from "@workspace/ui/blocks/content-panel"

import { useSaldokonto } from "./context"
import { OPEN_ITEM_TABS } from "./data"

/** Saldokonto content header — mounts into the app-shell contentHeader slot. */
export function SaldokontoHeader() {
  const { activeTab, setActiveTab, hiddenTabs, toggleTabHidden } =
    useSaldokonto()

  const tabs: ViewTab[] = OPEN_ITEM_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  return (
    <ContentHeader
      title="Saldokonto"
      viewTabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageViews={{
        tabs: OPEN_ITEM_TABS,
        hidden: hiddenTabs,
        onToggle: toggleTabHidden,
      }}
    />
  )
}
