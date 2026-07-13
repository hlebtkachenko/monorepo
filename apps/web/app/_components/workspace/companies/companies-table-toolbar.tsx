"use client"

import type { Table } from "@tanstack/react-table"
import Link from "next/link"

import { ContentToolbarLegacy } from "@workspace/ui/blocks/content-panel"
import { Button } from "@workspace/ui/components/button"
import {
  DataTableColumnManager,
  DataTableMultiSort,
} from "@workspace/ui/components/data-table"
import { useIcons } from "@workspace/ui/icon-packs"

import { ToolbarSearch } from "../_shared/toolbar-search"
import type { CompanyRow } from "./data"

export interface CompaniesTableToolbarProps {
  table: Table<CompanyRow>
  search: string
  onSearchChange: (value: string) => void
}

/**
 * Companies table toolbar — Left: a universal search (status is filtered by the
 * shared header tabs, not a duplicate control here). Right: the column manager,
 * multi-sort, and a primary "Add company" action linking to the create-org
 * wizard (`/workspace/organizations/new`).
 */
export function CompaniesTableToolbar({
  table,
  search,
  onSearchChange,
}: CompaniesTableToolbarProps) {
  const icons = useIcons()
  const PlusIcon = icons.Plus

  return (
    <ContentToolbarLegacy
      left={
        <ToolbarSearch
          value={search}
          onChange={onSearchChange}
          placeholder="Search companies…"
        />
      }
      right={
        <>
          <DataTableColumnManager table={table} />
          <DataTableMultiSort table={table} />
          <Button asChild size="sm">
            <Link href="/workspace/organizations/new">
              <PlusIcon />
              Add company
            </Link>
          </Button>
        </>
      }
    />
  )
}
