"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  getLaunchpadCounts,
  LaunchpadGrid,
  type ContentTab,
  type LaunchpadView,
} from "@workspace/ui/blocks/app-content"

import {
  ManageTabsMenu,
  PageHeaderActions,
  useTabVisibility,
} from "../_shared/content-header-extras"
import { OrgPageHeader } from "../org-page-header"
import { BASE_SECTIONS } from "./data"

const TAB_DEFS = [
  { value: "all", label: "All" },
  { value: "followed", label: "Followed" },
  { value: "unread", label: "Unread" },
] as const

/**
 * Launchpad archetype demo (#425). Holds the two pieces of page state the
 * archetype needs — the active view tab and the set of followed page ids — and
 * wires the header tabs (portaled into the shell's content-header slot) to the
 * `LaunchpadGrid` body, exactly as the Table demo links its header to its table.
 * The block stays presentational; this wrapper is the data + state seam.
 */
export function LaunchpadDemo() {
  const [view, setView] = React.useState<LaunchpadView>("all")
  const [followed, setFollowed] = React.useState<ReadonlySet<string>>(
    () =>
      new Set(
        BASE_SECTIONS.flatMap((s) => s.pages)
          .filter((p) => p.followed)
          .map((p) => p.id),
      ),
  )

  const toggleFollow = React.useCallback((pageId: string) => {
    setFollowed((prev) => {
      const next = new Set(prev)
      if (next.has(pageId)) next.delete(pageId)
      else next.add(pageId)
      return next
    })
  }, [])

  // Project the live follow state back onto the section data the block reads.
  const sections = React.useMemo(
    () =>
      BASE_SECTIONS.map((section) => ({
        ...section,
        pages: section.pages.map((page) => ({
          ...page,
          followed: followed.has(page.id),
        })),
      })),
    [followed],
  )

  const counts = getLaunchpadCounts(sections)
  const { hidden, toggle, visible } = useTabVisibility([...TAB_DEFS])
  const badges: Record<string, number> = {
    all: counts.all,
    followed: counts.followed,
    unread: counts.unread,
  }
  const tabs: ContentTab[] = visible.map((tab) => ({
    value: tab.value,
    label: tab.label,
    badge: badges[tab.value],
  }))

  return (
    <>
      <OrgPageHeader>
        <ContentHeader
          title="Overview"
          tabs={tabs}
          value={view}
          onValueChange={(value) => setView(value as LaunchpadView)}
          manageTabs={
            <ManageTabsMenu
              tabs={[...TAB_DEFS]}
              hidden={hidden}
              onToggle={toggle}
            />
          }
          actions={<PageHeaderActions />}
        />
      </OrgPageHeader>
      <ContentPanel>
        <LaunchpadGrid
          sections={sections}
          view={view}
          onToggleFollow={toggleFollow}
        />
      </ContentPanel>
    </>
  )
}
