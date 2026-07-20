"use client"

import * as React from "react"
import Link from "next/link"

import {
  ContentPanel,
  ContentToolbarLegacy,
} from "@workspace/ui/blocks/content-panel"
import { Button } from "@workspace/ui/components/button"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Separator } from "@workspace/ui/components/separator"
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
  const ChevronRightIcon = icons.ChevronRight

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
        <ContentToolbarLegacy
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

          {/* The rebuilt org tree (`/o/[orgSlug]`) — the new way of opening a
              company book. A full-width divider separates it from the current
              cards; each entry opens the same book in the new workspace shell. */}
          <div className="px-4 pb-4">
            <Separator className="mb-4" />
            <div className="mb-3">
              <h3 className="text-sm font-semibold text-foreground">
                Open in the new workspace
              </h3>
              <p className="text-xs text-muted-foreground">
                The rebuilt company experience (preview).
              </p>
            </div>
            <div className="grid grid-cols-1 gap-2 @md:grid-cols-2 @4xl:grid-cols-3">
              {data.map((company) => (
                <Link
                  key={company.id}
                  href={`/o/${company.slug}`}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border-subtle bg-card px-3 py-2.5 text-sm transition-colors hover:bg-accent"
                >
                  <span className="min-w-0 truncate font-medium">
                    {company.legalName}
                  </span>
                  <ChevronRightIcon className="size-4 shrink-0 text-muted-foreground" />
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </ContentPanel>
  )
}
