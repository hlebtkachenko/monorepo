"use client"

import * as React from "react"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { useOrgContent } from "./context"
import { INVOICE_TABS } from "./data"

/**
 * TEMP — the Content Panel header for the invoices demo. Mounts into the
 * app-shell `contentHeader` slot. Tabs + page actions are controlled by the
 * shared demo context so the body reacts to them.
 */
export function ContentDemoHeader() {
  const icons = useIcons()
  const {
    activeTab,
    setActiveTab,
    hiddenTabs,
    toggleTabHidden,
    favorite,
    toggleFavorite,
  } = useOrgContent()

  const EyeIcon = icons.Eye
  const EyeOffIcon = icons.EyeOff

  // Section scope + sort — demo-only local state (no functional effect yet);
  // refined when we build out the real content panel parts.
  const [scope, setScope] = React.useState("all")
  const [sort, setSort] = React.useState("alpha")

  const tabs: ContentTab[] = INVOICE_TABS.filter(
    (tab) => !hiddenTabs.has(tab.value),
  ).map((tab) => ({ value: tab.value, label: tab.label }))

  // Manage-tabs menu (Slack-style section options): a submenu to show/hide each
  // tab (eye / eye-off; "All" is always visible so it's disabled), then a
  // "show in this section" scope group and a "sort this section" group. The
  // scope/sort labels mirror the reference and are placeholders for now.
  const manageTabs = (
    <>
      <DropdownMenuSub>
        <DropdownMenuSubTrigger>Choose tabs</DropdownMenuSubTrigger>
        <DropdownMenuSubContent className="min-w-44">
          {INVOICE_TABS.map((tab) => {
            const hidden = hiddenTabs.has(tab.value)
            const alwaysOn = tab.value === "all"
            const Icon = hidden ? EyeOffIcon : EyeIcon
            return (
              <DropdownMenuItem
                key={tab.value}
                disabled={alwaysOn}
                onSelect={(event) => {
                  event.preventDefault()
                  if (!alwaysOn) toggleTabHidden(tab.value)
                }}
                className="justify-between gap-6"
              >
                <span className={cn(hidden && "text-muted-foreground")}>
                  {tab.label}
                </span>
                <Icon className="text-muted-foreground" />
              </DropdownMenuItem>
            )
          })}
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
      manageTabs={manageTabs}
      actions={actions}
    />
  )
}
