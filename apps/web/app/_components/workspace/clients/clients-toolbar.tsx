"use client"

import type { Table } from "@tanstack/react-table"

import { ContentToolbar } from "@workspace/ui/blocks/app-content"
import { Button } from "@workspace/ui/components/button"
import {
  DataTableColumnManager,
  DataTableFacetedFilter,
  DataTableMultiSort,
} from "@workspace/ui/components/data-table"
import { Input } from "@workspace/ui/components/input"
import { toast } from "@workspace/ui/components/sonner"
import { Search } from "@workspace/ui/lib/icons"
import { useIcons } from "@workspace/ui/icon-packs"

import { CLIENT_STATUS_OPTIONS, type ClientRow } from "./data"

export interface ClientsToolbarProps {
  table: Table<ClientRow>
  statusOpen: boolean
  onStatusOpenChange: (open: boolean) => void
  search: string
  onSearchChange: (value: string) => void
}

/**
 * Clients toolbar — Left: a faceted Status filter + a universal search. Right:
 * the column manager, multi-sort, and a primary "Add client" action (stub;
 * self-service org creation isn't wired, so it toasts for now).
 */
export function ClientsToolbar({
  table,
  statusOpen,
  onStatusOpenChange,
  search,
  onSearchChange,
}: ClientsToolbarProps) {
  const icons = useIcons()
  const PlusIcon = icons.Plus
  const statusColumn = table.getColumn("status")

  return (
    <ContentToolbar
      left={
        <>
          {statusColumn ? (
            <DataTableFacetedFilter
              column={statusColumn}
              title="Status"
              options={CLIENT_STATUS_OPTIONS}
              multiple
              open={statusOpen}
              onOpenChange={onStatusOpenChange}
            />
          ) : null}
          <div className="relative flex h-7 w-72 items-center">
            <Search className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
            <Input
              placeholder="Search clients…"
              value={search}
              onChange={(event) => onSearchChange(event.target.value)}
              className="h-7 w-full pl-8"
            />
          </div>
        </>
      }
      right={
        <>
          <DataTableColumnManager table={table} />
          <DataTableMultiSort table={table} />
          <Button size="sm" onClick={() => toast("Add client — coming soon")}>
            <PlusIcon />
            Add client
          </Button>
        </>
      }
    />
  )
}
