"use client"

import type { Column } from "@tanstack/react-table"
import { ChevronDown, ChevronsUpDown, ChevronUp, EyeOff, X } from "@workspace/ui/lib/icons"

import { cn } from "@workspace/ui/lib/utils"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

interface DataTableColumnHeaderProps<
  TData,
  TValue,
> extends React.ComponentProps<typeof DropdownMenuTrigger> {
  column: Column<TData, TValue>
  label: string
}

export function DataTableColumnHeader<TData, TValue>({
  column,
  label,
  className,
  ...props
}: DataTableColumnHeaderProps<TData, TValue>) {
  if (!column.getCanSort() && !column.getCanHide()) {
    return (
      <div data-slot="data-table-column-header" className={cn(className)}>
        {label}
      </div>
    )
  }

  const sorted = column.getIsSorted()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="data-table-column-header"
        className={cn(
          "-ml-1.5 flex h-8 items-center gap-1.5 rounded-md px-2 py-1.5 text-sm font-medium outline-none hover:bg-muted focus:outline-none focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-muted",
          sorted && "text-primary [&_svg]:text-primary",
          "[&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
          className,
        )}
        {...props}
      >
        {label}
        {column.getCanSort() &&
          (sorted === "desc" ? (
            <ChevronDown />
          ) : sorted === "asc" ? (
            <ChevronUp />
          ) : (
            <ChevronsUpDown />
          ))}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-32">
        {column.getCanSort() && (
          <>
            <DropdownMenuCheckboxItem
              className="[&_svg]:text-muted-foreground"
              checked={sorted === "asc"}
              onClick={() => column.toggleSorting(false)}
            >
              <ChevronUp />
              Asc
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              className="[&_svg]:text-muted-foreground"
              checked={sorted === "desc"}
              onClick={() => column.toggleSorting(true)}
            >
              <ChevronDown />
              Desc
            </DropdownMenuCheckboxItem>
            {sorted && (
              <DropdownMenuItem
                className="[&_svg]:text-muted-foreground"
                onClick={() => column.clearSorting()}
              >
                <X />
                Reset
              </DropdownMenuItem>
            )}
          </>
        )}
        {column.getCanHide() && (
          <DropdownMenuCheckboxItem
            className="[&_svg]:text-muted-foreground"
            checked={!column.getIsVisible()}
            onClick={() => column.toggleVisibility(false)}
          >
            <EyeOff />
            Hide
          </DropdownMenuCheckboxItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
