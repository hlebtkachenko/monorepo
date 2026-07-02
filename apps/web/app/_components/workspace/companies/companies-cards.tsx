"use client"

import * as React from "react"

import { ContentPanel, ContentToolbar } from "@workspace/ui/blocks/app-content"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { Search } from "@workspace/ui/lib/icons"
import { useIcons } from "@workspace/ui/icon-packs"

import { CompanyCard } from "./company-card"
import { useCompanies } from "./context"
import { COMPANY_TABS, type CompanyRow } from "./data"

/** Free-text search across the company's readable fields (mirrors the table). */
function applySearch(rows: CompanyRow[], query: string): CompanyRow[] {
  const q = query.trim().toLowerCase()
  if (!q) return rows
  return rows.filter((row) =>
    [row.legalName, row.slug, row.typeLabel, row.vatRegime, row.assignee].some(
      (value) => value.toLowerCase().includes(q),
    ),
  )
}

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

  return (
    <ContentPanel
      toolbar={
        <ContentToolbar
          left={
            <div className="relative flex h-7 w-72 items-center">
              <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
              <Input
                placeholder="Search companies…"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-7 w-full pl-8"
              />
            </div>
          }
          right={
            <Button
              size="sm"
              onClick={() => toast("Add company — coming soon")}
            >
              <PlusIcon />
              Add company
            </Button>
          }
        />
      }
    >
      {data.length === 0 ? (
        <div className="grid h-full place-items-center p-8 text-center">
          <div className="max-w-sm space-y-1">
            <p className="text-sm font-medium text-foreground">
              No companies here
            </p>
            <p className="text-sm text-muted-foreground">
              {search.trim() || activeTab !== "all"
                ? "No companies match the current filter."
                : "This workspace has no company books yet."}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid gap-4 p-4 sm:grid-cols-2 xl:grid-cols-3">
          {data.map((company) => (
            <CompanyCard key={company.id} company={company} />
          ))}
        </div>
      )}
    </ContentPanel>
  )
}
