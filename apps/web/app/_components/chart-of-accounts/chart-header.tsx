"use client"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { IconButton } from "@workspace/ui/components/icon-button"
import { cn } from "@workspace/ui/lib/utils"

import { ManageTabsMenu } from "../_shared/content-header-extras"
import { useChart } from "./context"
import { ACCOUNT_TABS } from "./data"

/** Účtový rozvrh content header — mounts into the app-shell contentHeader slot. */
export function ChartHeader() {
  const {
    activeTab,
    setActiveTab,
    hiddenTabs,
    toggleTabHidden,
    favorite,
    toggleFavorite,
  } = useChart()

  const tabs: ContentTab[] = ACCOUNT_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  return (
    <ContentHeader
      title="Účtový rozvrh"
      tabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageTabs={
        <ManageTabsMenu
          tabs={ACCOUNT_TABS}
          hidden={hiddenTabs}
          onToggle={toggleTabHidden}
        />
      }
      actions={
        <IconButton
          icon="Star"
          aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
          tooltip="Favorite"
          tooltipSide="bottom"
          onClick={toggleFavorite}
          className={cn(favorite && "text-primary [&_svg]:fill-current")}
        />
      }
    />
  )
}
