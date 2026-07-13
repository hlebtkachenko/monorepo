"use client"

import Link from "next/link"
import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  getLaunchpadCounts,
  LaunchpadGrid,
  type LaunchpadView,
  type ViewTab,
} from "@workspace/ui/blocks/content-panel"

import { useTabVisibility } from "../_shared/content-header-extras"
import { AppPageHeader } from "@workspace/ui/blocks/app-shell"
import { BASE_SECTIONS } from "./data"

const TAB_DEFS = [
  { value: "all", label: "All" },
  { value: "followed", label: "Followed" },
  { value: "unread", label: "Unread" },
] as const

/**
 * Accounting module overview hub — the Launchpad archetype on the persistent org
 * shell. Lays out the accounting book pages + a grouped "Výstupy" section (the
 * statutory outputs) as cards, with header view tabs (All / Followed / Unread)
 * and a per-card follow star.
 *
 * Holds the two pieces of archetype state — the active view tab and the set of
 * followed page ids — and prefixes each relative page slug with the org
 * (`/${orgSlug}/${page.href}`) so the block's `Link` navigates within the shell.
 * `linkComponent` is Next's `Link` for client-side navigation.
 */
export function AccountingOverview({ orgSlug }: { orgSlug: string }) {
  const [view, setView] = React.useState<LaunchpadView>("all")
  const [followed, setFollowed] = React.useState<ReadonlySet<string>>(
    () =>
      new Set(
        BASE_SECTIONS.flatMap((s) => s.pages).flatMap((p) => [
          ...(p.followed ? [p.id] : []),
          ...(p.subpages ?? [])
            .filter((sub) => sub.followed)
            .map((sub) => sub.id),
        ]),
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

  // Project the live follow state onto the section data and resolve every
  // relative page slug to an org-prefixed href the shell's Link can navigate to.
  const sections = React.useMemo(
    () =>
      BASE_SECTIONS.map((section) => ({
        ...section,
        pages: section.pages.map((page) => ({
          ...page,
          href: page.href ? `/${orgSlug}/${page.href}` : page.href,
          followed: followed.has(page.id),
          subpages: page.subpages?.map((sub) => ({
            ...sub,
            href: sub.href ? `/${orgSlug}/${sub.href}` : sub.href,
            followed: followed.has(sub.id),
          })),
        })),
      })),
    [followed, orgSlug],
  )

  const counts = getLaunchpadCounts(sections)
  const { hidden, toggle, visible, activeValue } = useTabVisibility(
    [...TAB_DEFS],
    view,
  )
  const activeView = (activeValue ?? "all") as LaunchpadView
  const badges: Record<string, number> = {
    all: counts.all,
    followed: counts.followed,
    unread: counts.unread,
  }
  const tabs: ViewTab[] = visible.map((tab) => ({
    value: tab.value,
    label: tab.label,
    badge: badges[tab.value],
  }))

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title="Přehled"
          viewTabs={tabs}
          value={activeView}
          onValueChange={(value) => setView(value as LaunchpadView)}
          manageViews={{ tabs: [...TAB_DEFS], hidden, onToggle: toggle }}
        />
      </AppPageHeader>
      <ContentPanel>
        <LaunchpadGrid
          sections={sections}
          view={activeView}
          onToggleFollow={toggleFollow}
          linkComponent={Link}
        />
      </ContentPanel>
    </>
  )
}
