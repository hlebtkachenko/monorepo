"use client"

import { usePathname, useRouter } from "next/navigation"

import { ContentHeader } from "@workspace/ui/blocks/content-panel"

import { AdminPageHeader } from "./admin-page-header"

export interface DetailTab {
  value: string
  label: string
  href: string
}

/**
 * Detail-page header for the shell content-header slot: the entity title plus
 * route-driven tabs. The active tab is the one whose href is the longest prefix
 * of the current path (so `/orgs/123` lights "Overview" and `/orgs/123/members`
 * lights "Members"); selecting a tab navigates. Portaled into the shell header
 * via `AdminPageHeader`.
 */
export function DetailTabsHeader({
  title,
  tabs,
}: {
  title: string
  tabs: DetailTab[]
}) {
  const pathname = usePathname() ?? ""
  const router = useRouter()

  // Longest-prefix active tab — the deepest href that matches the path.
  let active = tabs[0]?.value
  let bestLen = -1
  for (const tab of tabs) {
    const matches = pathname === tab.href || pathname.startsWith(tab.href + "/")
    if (matches && tab.href.length > bestLen) {
      bestLen = tab.href.length
      active = tab.value
    }
  }

  return (
    <AdminPageHeader>
      <ContentHeader
        title={title}
        tabs={tabs.map((t) => ({ value: t.value, label: t.label }))}
        value={active}
        onValueChange={(value) => {
          const tab = tabs.find((t) => t.value === value)
          if (tab) router.push(tab.href)
        }}
      />
    </AdminPageHeader>
  )
}
