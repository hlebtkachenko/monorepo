"use client"

import * as React from "react"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"

import { useOrgContent } from "./context"
import { FAKTURY_TABS } from "./data"

/**
 * TEMP — the Content Panel header for the Faktury přijaté demo. Mounts into the
 * app-shell `contentHeader` slot. Tabs + page actions are controlled by the
 * shared demo context so the body reacts to them.
 */
export function ContentDemoHeader() {
  const {
    activeTab,
    setActiveTab,
    hiddenTabs,
    toggleTabHidden,
    favorite,
    toggleFavorite,
    showToolbarActions,
    setShowToolbarActions,
  } = useOrgContent()

  // Section scope + sort — demo-only local state (no functional effect yet);
  // refined when we build out the real content panel parts.
  const [scope, setScope] = React.useState("all")
  const [sort, setSort] = React.useState("alpha")

  const tabs: ContentTab[] = FAKTURY_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  // Manage-tabs menu (Slack-style section options): a submenu to choose which
  // tabs are shown (functional, no drag-reorder), then a "show in this section"
  // scope group and a "sort this section" group. The scope/sort labels mirror
  // the reference and are placeholders until the real parts are wired.
  const manageTabs = (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Choose tabs</DropdownMenuSubTrigger>
        <DropdownMenuSubContent>
          {FAKTURY_TABS.map((tab) => (
            <DropdownMenuCheckboxItem
              key={tab.value}
              checked={!hiddenTabs.has(tab.value)}
              onCheckedChange={() => toggleTabHidden(tab.value)}
              onSelect={(event) => event.preventDefault()}
            >
              {tab.label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuSubContent>
      </DropdownMenuSub>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Show in this section</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={scope} onValueChange={setScope}>
        <DropdownMenuRadioItem value="all">All</DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="unread">
          Unreads updates only
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="mentions">
          Mentions only
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>Sort this section</DropdownMenuLabel>
      <DropdownMenuRadioGroup value={sort} onValueChange={setSort}>
        <DropdownMenuRadioItem value="alpha">
          Alphabetically
        </DropdownMenuRadioItem>
        <DropdownMenuRadioItem value="recent">
          By most recent
        </DropdownMenuRadioItem>
      </DropdownMenuRadioGroup>
    </>
  )

  const actions = (
    <>
      <IconButton
        icon="Star"
        active={favorite}
        aria-label={favorite ? "Odebrat z oblíbených" : "Přidat do oblíbených"}
        tooltip="Oblíbené"
        tooltipSide="bottom"
        onClick={toggleFavorite}
      />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* No tooltip — this IconButton is a Radix menu trigger. */}
          <IconButton icon="Ellipsis" aria-label="Spravovat stránku" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem>Kopírovat odkaz</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuCheckboxItem
            checked={showToolbarActions}
            onCheckedChange={setShowToolbarActions}
            onSelect={(event) => event.preventDefault()}
          >
            Zobrazit akce v liště
          </DropdownMenuCheckboxItem>
          <DropdownMenuItem>Nastavení stránky</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )

  return (
    <ContentHeader
      title="Faktury přijaté"
      tabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      manageTabs={manageTabs}
      actions={actions}
    />
  )
}
