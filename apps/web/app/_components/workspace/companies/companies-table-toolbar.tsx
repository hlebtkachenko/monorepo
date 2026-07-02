"use client"

import type { Table } from "@tanstack/react-table"

import { ContentToolbar } from "@workspace/ui/blocks/app-content"
import { Button } from "@workspace/ui/components/button"
import {
  DataTableColumnManager,
  DataTableMultiSort,
} from "@workspace/ui/components/data-table"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { Search } from "@workspace/ui/lib/icons"
import { useIcons } from "@workspace/ui/icon-packs"

import type { CompanyRow } from "./data"

export interface CompaniesTableToolbarProps {
  table: Table<CompanyRow>
  search: string
  onSearchChange: (value: string) => void
}

/**
 * Companies table toolbar — Left: a universal search (status is filtered by the
 * shared header tabs, not a duplicate control here). Right: the column manager,
 * multi-sort, and a primary "Add company" action (stub; self-service org
 * creation isn't wired, so it toasts for now).
 */
export function CompaniesTableToolbar({
  table,
  search,
  onSearchChange,
}: CompaniesTableToolbarProps) {
  const icons = useIcons()
  const PlusIcon = icons.Plus

  return (
    <ContentToolbar
      left={
        <div className="relative flex h-7 w-72 items-center">
          <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
          <Input
            placeholder="Search companies…"
            value={search}
            onChange={(event) => onSearchChange(event.target.value)}
            className="h-7 w-full pl-8"
          />
        </div>
      }
      right={
        <>
          <DataTableColumnManager table={table} />
          <DataTableMultiSort table={table} />
          <Button size="sm" onClick={() => toast("Add company — coming soon")}>
            <PlusIcon />
            Add company
          </Button>
        </>
      }
    />
  )
}
