"use client"

import * as React from "react"
import { LayoutGrid, Rows3 } from "lucide-react"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { toast } from "@workspace/ui/components/sonner"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { AppPageHeader } from "../../app-page-header"
import { PageHeaderActions } from "../../_shared/content-header-extras"
import { CompaniesCards } from "./companies-cards"
import { CompaniesTable } from "./companies-table"
import { useCompanies, type CompaniesView as ViewMode } from "./context"
import { COMPANY_TABS, type CompanyRow } from "./data"

/**
 * Companies — the accountant-office hub of company books. The portaled header
 * carries the status tabs (shared by both views) and the Card/Table view
 * toggle; the body is the big-card grid or the dense table. The content-header
 * title is "All companies" (the sidebar module h2 already says "Companies", so
 * they stay distinct).
 */
export function CompaniesView({
  companies,
  errorMessage,
}: {
  companies: CompanyRow[]
  /** `?error=` redirected here from the org layout on a failed book entry. */
  errorMessage?: string
}) {
  const { activeTab, setActiveTab, view, setView } = useCompanies()

  React.useEffect(() => {
    if (errorMessage) toast.error(errorMessage)
  }, [errorMessage])

  const tabs: ContentTab[] = COMPANY_TABS.map((tab) => ({
    value: tab.value,
    label: tab.label,
  }))

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title="All companies"
          tabs={tabs}
          value={activeTab}
          onValueChange={setActiveTab}
          actions={
            <>
              <TooltipProvider delayDuration={200}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <ToggleGroup
                      type="single"
                      value={view}
                      onValueChange={(value) => {
                        if (value) setView(value as ViewMode)
                      }}
                      variant="outline"
                      size="sm"
                    >
                      <ToggleGroupItem value="cards" aria-label="Card view">
                        <LayoutGrid />
                      </ToggleGroupItem>
                      <ToggleGroupItem value="table" aria-label="Table view">
                        <Rows3 />
                      </ToggleGroupItem>
                    </ToggleGroup>
                  </TooltipTrigger>
                  <TooltipContent side="bottom">
                    View — cards or table
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <PageHeaderActions />
            </>
          }
        />
      </AppPageHeader>
      {view === "table" ? (
        <CompaniesTable companies={companies} />
      ) : (
        <CompaniesCards companies={companies} />
      )}
    </>
  )
}
