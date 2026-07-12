"use client"

import * as React from "react"
import Link from "next/link"

import { ContentPanel, ContentToolbar } from "@workspace/ui/blocks/content-panel"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { useIcons } from "@workspace/ui/icon-packs"

import { ToolbarSearch } from "../_shared/toolbar-search"
import { CompanyCard } from "./company-card"
import { useCompanies } from "./context"
import { applySearch, COMPANY_TABS, type CompanyRow } from "./data"

/**
 * Companies — the big-card view. A responsive grid of `CompanyCard`s, tab-
 * filtered by status (shared header tabs) and a local search. Self-contained
 * `ContentPanel` so it drops straight under the portaled header, same as the
 * table view.
 */
export function CompaniesCards({ companies }: { companies: CompanyRow[] }) {
  const { activeTab } = useCompanies()
  const [search, setSearch] = React.useState("")
  const icons = useIcons()
  const PlusIcon = icons.Plus

  const data = React.useMemo(() => {
    const tab = COMPANY_TABS.find((t) => t.value === activeTab)
    const byStatus = tab?.status
      ? companies.filter((c) => c.status === tab.status)
      : companies
    return applySearch(byStatus, search)
  }, [companies, activeTab, search])

  const isFiltered = search.trim() !== "" || activeTab !== "all"

  return (
    <ContentPanel
      toolbar={
        <ContentToolbar
          left={
            <ToolbarSearch
              value={search}
              onChange={setSearch}
              placeholder="Search companies…"
            />
          }
          right={
            <Button asChild size="sm">
              <Link href="/workspace/organizations/new">
                <PlusIcon />
                Add company
              </Link>
            </Button>
          }
        />
      }
    >
      {data.length === 0 ? (
        <div className="grid h-full place-items-center p-8">
          <Empty className="border-0">
            <EmptyHeader>
              <EmptyTitle>No companies here</EmptyTitle>
              <EmptyDescription>
                {isFiltered
                  ? "No companies match the current filter."
                  : "This workspace has no company books yet."}
              </EmptyDescription>
            </EmptyHeader>
            {isFiltered ? null : (
              <Button asChild size="sm">
                <Link href="/workspace/organizations/new">
                  <PlusIcon />
                  Add company
                </Link>
              </Button>
            )}
          </Empty>
        </div>
      ) : (
        <div className="@container">
          <div className="grid grid-cols-1 gap-3 p-4 @md:grid-cols-2 @4xl:grid-cols-3">
            {data.map((company) => (
              <CompanyCard key={company.id} company={company} />
            ))}
          </div>
        </div>
      )}
    </ContentPanel>
  )
}
