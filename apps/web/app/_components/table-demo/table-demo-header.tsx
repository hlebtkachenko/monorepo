"use client"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { IconButton } from "@workspace/ui/components/icon-button"
import { cn } from "@workspace/ui/lib/utils"

import { ManageTabsMenu } from "../_shared/content-header-extras"
import { useOrgContent } from "./context"
import { INVOICE_TABS } from "./data"

/**
 * TEMP — the Content Panel header for the invoices demo. Mounts into the
 * app-shell `contentHeader` slot. Tabs + page actions are controlled by the
 * shared demo context so the body reacts to them. The manage-tabs (⋯) menu is
 * the shared `ManageTabsMenu`, so this Table demo and the archetype demos carry
 * the identical mechanism (choose tabs + show-in-section + sort).
 */
export function TableDemoHeader() {
  const {
    activeTab,
    setActiveTab,
    hiddenTabs,
    toggleTabHidden,
    favorite,
    toggleFavorite,
  } = useOrgContent()

  const tabs: ContentTab[] = INVOICE_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  const actions = (
    <>
      <IconButton
        icon="Star"
        aria-label={favorite ? "Remove from favorites" : "Add to favorites"}
        tooltip="Favorite"
        tooltipSide="bottom"
        onClick={toggleFavorite}
        className={cn(favorite && "text-primary [&_svg]:fill-current")}
      />
      <IconButton
        icon="Settings2"
        aria-label="Settings"
        tooltip="Settings"
        tooltipSide="bottom"
      />
    </>
  )

  return (
    <ContentHeader
      title="Incoming invoices"
      tabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageTabs={
        <ManageTabsMenu
          tabs={INVOICE_TABS}
          hidden={hiddenTabs}
          onToggle={toggleTabHidden}
        />
      }
      actions={actions}
    />
  )
}
