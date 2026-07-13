"use client"

import { ContentHeader, type ViewTab } from "@workspace/ui/blocks/content-panel"

import { useLedger } from "./context"
import { LEDGER_TABS } from "./data"

/** Hlavní kniha content header — mounts into the app-shell contentHeader slot. */
export function LedgerHeader() {
  const { activeTab, setActiveTab, hiddenTabs, toggleTabHidden } = useLedger()

  const tabs: ViewTab[] = LEDGER_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  return (
    <ContentHeader
      title="Hlavní kniha"
      viewTabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageViews={{
        tabs: LEDGER_TABS,
        hidden: hiddenTabs,
        onToggle: toggleTabHidden,
      }}
    />
  )
}
