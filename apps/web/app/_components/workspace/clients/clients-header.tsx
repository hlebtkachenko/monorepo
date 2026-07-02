"use client"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"

import { PageHeaderActions } from "../../_shared/content-header-extras"
import { useClients } from "./context"
import { CLIENT_TABS } from "./data"

/**
 * Clients content-header — portaled into the shell's 45px content-header slot
 * via `AppPageHeader`. The title lives here (never a body `<h1>`); tabs are the
 * status views, controlled by the shared page context so the body filters in
 * step.
 */
export function ClientsHeader() {
  const { activeTab, setActiveTab } = useClients()

  const tabs: ContentTab[] = CLIENT_TABS.map((tab) => ({
    value: tab.value,
    label: tab.label,
  }))

  return (
    <ContentHeader
      title="All clients"
      tabs={tabs}
      value={activeTab}
      onValueChange={setActiveTab}
      actions={<PageHeaderActions />}
    />
  )
}
