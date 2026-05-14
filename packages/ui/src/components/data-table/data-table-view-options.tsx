"use client"

import type { Table } from "@tanstack/react-table"
import { Check, Settings2 } from "@workspace/ui/lib/icons"
import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { getColumnLabel } from "./data-table-utils"

interface DataTableViewOptionsProps<TData> extends React.ComponentProps<
  typeof PopoverContent
> {
  table: Table<TData>
  disabled?: boolean
}

export function DataTableViewOptions<TData>({
  table,
  disabled,
  ...props
}: DataTableViewOptionsProps<TData>) {
  const columns = React.useMemo(
    () =>
      table
        .getAllColumns()
        .filter(
          (column) =>
            typeof column.accessorFn !== "undefined" && column.getCanHide(),
        ),
    [table],
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          data-slot="data-table-view-options-trigger"
          aria-label="Toggle columns"
          role="combobox"
          variant="outline"
          size="sm"
          className="ml-auto hidden font-normal lg:flex"
          disabled={disabled}
        >
          <Settings2 className="text-muted-foreground" />
          View
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-slot="data-table-view-options"
        className="w-44 p-0"
        {...props}
      >
        <Command>
          <CommandInput placeholder="Search columns..." />
          <CommandList>
            <CommandEmpty>No columns found.</CommandEmpty>
            <CommandGroup>
              {columns.map((column) => (
                <CommandItem
                  key={column.id}
                  onSelect={() =>
                    column.toggleVisibility(!column.getIsVisible())
                  }
                >
                  <span className="truncate">{getColumnLabel(column)}</span>
                  <Check
                    className={cn(
                      "ml-auto size-4 shrink-0",
                      column.getIsVisible() ? "opacity-100" : "opacity-0",
                    )}
                  />
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
