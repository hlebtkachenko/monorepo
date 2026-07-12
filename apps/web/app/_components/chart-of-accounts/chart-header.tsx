"use client"

import { ContentHeader, type ViewTab } from "@workspace/ui/blocks/content-panel"

import { useChart } from "./context"
import { ACCOUNT_TABS } from "./data"

/** Účtový rozvrh content header — mounts into the app-shell contentHeader slot. */
export function ChartHeader() {
  const { activeTab, setActiveTab, hiddenTabs, toggleTabHidden } = useChart()

  const tabs: ViewTab[] = ACCOUNT_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  return (
    <ContentHeader
      title="Účtový rozvrh"
      viewTabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageViews={{
        tabs: ACCOUNT_TABS,
        hidden: hiddenTabs,
        onToggle: toggleTabHidden,
      }}
    />
  )
}
