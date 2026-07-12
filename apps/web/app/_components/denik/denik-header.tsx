"use client"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/content-panel"
import { IconButton } from "@workspace/ui/components/icon-button"
import { cn } from "@workspace/ui/lib/utils"

import { ManageTabsMenu } from "../_shared/content-header-extras"
import { useDenik } from "./context"
import { JOURNAL_TABS } from "./data"

/** Deník content header — mounts into the app-shell contentHeader slot. */
export function DenikHeader() {
  const {
    activeTab,
    setActiveTab,
    hiddenTabs,
    toggleTabHidden,
    favorite,
    toggleFavorite,
  } = useDenik()

  const tabs: ContentTab[] = JOURNAL_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  return (
    <ContentHeader
      title="Deník"
      tabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageTabs={
        <ManageTabsMenu
          tabs={JOURNAL_TABS}
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
