"use client"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"

import { PageHeaderActions } from "../../_shared/content-header-extras"
import { useLegislation } from "./context"
import { OBLIGATION_TABS } from "./data"

/**
 * Legislation content-header — portaled into the shell's content-header slot via
 * `AppPageHeader`. The title lives here (never a body `<h1>`); tabs are the
 * status views, controlled by the shared page context so the body filters in
 * step. No manage-tabs menu — the four status buckets are fixed.
 */
export function LegislationHeader() {
  const { activeTab, setActiveTab } = useLegislation()

  const tabs: ContentTab[] = OBLIGATION_TABS.map((tab) => ({
    value: tab.value,
    label: tab.label,
  }))

  return (
    <ContentHeader
      title="All obligations"
      tabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      actions={<PageHeaderActions />}
    />
  )
}
