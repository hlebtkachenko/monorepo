"use client"

import * as React from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
// LayoutGrid / Rows3 are not in the workspace icon pack (no grid/rows glyphs);
// keep the direct lucide import as the sole documented exception here.
import { LayoutGrid, Rows3 } from "lucide-react"

import {
  ContentHeader,
  type ContentTab,
} from "@workspace/ui/blocks/content-panel"
import { Button } from "@workspace/ui/components/button"
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
import { useIcons } from "@workspace/ui/icon-packs"

import { AppPageHeader } from "../../app-page-header"
import { PageHeaderActions } from "../../_shared/content-header-extras"
import { CompaniesCards } from "./companies-cards"
import { CompaniesTable } from "./companies-table"
import { useCompanies, type CompaniesView as ViewMode } from "./context"
import { COMPANY_TABS, type CompanyRow } from "./data"

const CardsIcon = LayoutGrid
const TableIcon = Rows3

/**
 * Companies — the accountant-office hub of company books. The portaled header
 * carries the status tabs (shared by both views, with per-status counts) and
 * the Card/Table view toggle; the body is the big-card grid or the dense table.
 * The content-header title is "All companies" (the sidebar module h2 already
 * says "Companies", so they stay distinct).
 */
export function CompaniesView({
  companies,
  errorMessage,
  showArchived = false,
}: {
  companies: CompanyRow[]
  /** `?error=` redirected here from the org layout on a failed book entry. */
  errorMessage?: string
  /** Server-resolved: the list is showing archived books (`?archived=1`). */
  showArchived?: boolean
}) {
  const router = useRouter()
  const icons = useIcons()
  const PlusIcon = icons.Plus
  const ExportIcon = icons.Download
  const { activeTab, setActiveTab, view, setView } = useCompanies()
  const errorHandled = React.useRef(false)

  React.useEffect(() => {
    if (!errorMessage || errorHandled.current) return
    errorHandled.current = true
    toast.error(errorMessage)
    // Strip `?error=` so a reload doesn't re-toast the same message.
    router.replace("/workspace")
  }, [errorMessage, router])

  const tabs: ContentTab[] = COMPANY_TABS.map((tab) => ({
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
          tabs={tabs}
          value={activeTab}
          onValueChange={setActiveTab}
          actions={
            <>
              {/* Active vs archived books — REAL isolation on
                  organization.archived_at, driven by the `?archived=` param
                  (distinct from the mock status tabs). */}
              <ToggleGroup
                type="single"
                value={showArchived ? "archived" : "active"}
                variant="outline"
                size="sm"
              >
                <ToggleGroupItem value="active" asChild>
                  <Link href="/workspace">Active</Link>
                </ToggleGroupItem>
                <ToggleGroupItem value="archived" asChild>
                  <Link href="/workspace?archived=1">Archived</Link>
                </ToggleGroupItem>
              </ToggleGroup>
              <TooltipProvider delayDuration={200}>
                <ToggleGroup
                  type="single"
                  value={view}
                  onValueChange={(value) => {
                    if (value) setView(value as ViewMode)
                  }}
                  variant="outline"
                  size="sm"
                >
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value="cards" aria-label="Card view">
                        <CardsIcon />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Card view</TooltipContent>
                  </Tooltip>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <ToggleGroupItem value="table" aria-label="Table view">
                        <TableIcon />
                      </ToggleGroupItem>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">Table view</TooltipContent>
                  </Tooltip>
                </ToggleGroup>
              </TooltipProvider>
              <Button asChild variant="outline" size="sm">
                <a href="/workspace/organizations/export">
                  <ExportIcon />
                  Export CSV
                </a>
              </Button>
              <Button asChild size="sm">
                <Link href="/workspace/organizations/new">
                  <PlusIcon />
                  New company
                </Link>
              </Button>
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
