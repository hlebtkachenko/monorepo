"use client"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { IconButton } from "@workspace/ui/components/icon-button"
import { cn } from "@workspace/ui/lib/utils"

import { ManageTabsMenu } from "../_shared/content-header-extras"
import { useSaldokonto } from "./context"
import { OPEN_ITEM_TABS } from "./data"

/** Saldokonto content header — mounts into the app-shell contentHeader slot. */
export function SaldokontoHeader() {
  const {
    activeTab,
    setActiveTab,
    hiddenTabs,
    toggleTabHidden,
    favorite,
    toggleFavorite,
  } = useSaldokonto()

  const tabs: ContentTab[] = OPEN_ITEM_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  return (
    <ContentHeader
      title="Saldokonto"
      tabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageTabs={
        <ManageTabsMenu
          tabs={OPEN_ITEM_TABS}
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
