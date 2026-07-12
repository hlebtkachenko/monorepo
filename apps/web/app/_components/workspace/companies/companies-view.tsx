"use client"

import * as React from "react"
import { useRouter } from "next/navigation"

import { ContentHeader, type ViewTab } from "@workspace/ui/blocks/content-panel"
import { toast } from "@workspace/ui/components/sonner"

import { AppPageHeader } from "../../app-page-header"
import { CompaniesCards } from "./companies-cards"
import { CompaniesTable } from "./companies-table"
import { useCompanies } from "./context"
import { COMPANY_TABS, type CompanyRow } from "./data"

/**
 * Companies — the accountant-office hub of company books. The portaled header
 * carries the status tabs (with per-status counts); the body is the big-card
 * grid or the dense table. The Card/Table view toggle, Export, and New-company
 * actions were dropped from the header pending the archetype rebuild (see the
 * TODO(archetype-redo) below). The content-header title is "All companies" (the
 * sidebar module h2 already says "Companies", so they stay distinct).
 */
export function CompaniesView({
  companies,
  errorMessage,
}: {
  companies: CompanyRow[]
  /** `?error=` redirected here from the org layout on a failed book entry. */
  errorMessage?: string
  /**
   * Server-resolved: the list is showing archived books (`?archived=1`).
   * TODO(archetype-redo): unconsumed since the header active/archived toggle was
   * dropped; server-side `?archived=` filtering still works. Rewire on rebuild.
   */
  showArchived?: boolean
}) {
  const router = useRouter()
  const { activeTab, setActiveTab, view } = useCompanies()
  const errorHandled = React.useRef(false)

  React.useEffect(() => {
    if (!errorMessage || errorHandled.current) return
    errorHandled.current = true
    toast.error(errorMessage)
    // Strip `?error=` so a reload doesn't re-toast the same message.
    router.replace("/workspace")
  }, [errorMessage, router])

  const tabs: ViewTab[] = COMPANY_TABS.map((tab) => ({
    value: tab.value,
    label: tab.label,
    badge: tab.status
      ? companies.filter((c) => c.status === tab.status).length
      : companies.length,
  }))

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title="All companies"
          viewTabs={tabs}
          value={activeTab}
          onValueChange={setActiveTab}
        />
        {/* TODO(archetype-redo): the active/archived toggle, card/table view toggle, Export CSV, and New company buttons lived in the header; relocate to the body on rebuild. */}
      </AppPageHeader>
      {view === "table" ? (
        <CompaniesTable companies={companies} />
      ) : (
        <CompaniesCards companies={companies} />
      )}
    </>
  )
}
