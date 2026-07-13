"use client"

import { ContentHeader, type ViewTab } from "@workspace/ui/blocks/content-panel"

import { useDenik } from "./context"
import { JOURNAL_TABS } from "./data"

/** Deník content header — mounts into the app-shell contentHeader slot. */
export function DenikHeader() {
  const { activeTab, setActiveTab, hiddenTabs, toggleTabHidden } = useDenik()

  const tabs: ViewTab[] = JOURNAL_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  return (
    <ContentHeader
      title="Deník"
      viewTabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageViews={{
        tabs: JOURNAL_TABS,
        hidden: hiddenTabs,
        onToggle: toggleTabHidden,
      }}
    />
  )
}
