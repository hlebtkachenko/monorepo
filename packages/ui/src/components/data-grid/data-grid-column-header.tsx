"use client"

import * as React from "react"
import type { Header } from "@tanstack/react-table"
import { ChevronDown, ChevronsUpDown, ChevronUp, EyeOff, X } from "@workspace/ui/lib/icons"

import { cn } from "@workspace/ui/lib/utils"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { getColumnVariant } from "./data-grid"

interface DataGridColumnHeaderProps<TData, TValue> {
  header: Header<TData, TValue>
  className?: string
}

export function DataGridColumnHeader<TData, TValue>({
  header,
  className,
}: DataGridColumnHeaderProps<TData, TValue>) {
  const column = header.column
  const label =
    column.columnDef.meta?.label ??
    (typeof column.columnDef.header === "string"
      ? column.columnDef.header
      : column.id)
  const variant = getColumnVariant(column.columnDef.meta?.cell?.variant)
  const sorted = column.getIsSorted()

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        data-slot="data-grid-column-header"
        className={cn(
          "flex size-full items-center justify-between gap-2 px-2 py-1.5 text-sm font-medium outline-none hover:bg-muted/50 data-[state=open]:bg-muted/50",
          sorted && "text-primary",
          className,
        )}
      >
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          {variant && (
            <TooltipProvider delayDuration={150}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <variant.icon className="size-3.5 shrink-0 text-muted-foreground" />
                </TooltipTrigger>
                <TooltipContent side="top">
                  <p>{variant.label}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
          <span className="truncate">{label}</span>
        </div>
        {column.getCanSort() &&
          (sorted === "desc" ? (
            <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
          ) : sorted === "asc" ? (
            <ChevronUp className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          ))}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-44">
        {column.getCanSort() && (
          <>
            <DropdownMenuCheckboxItem
              checked={sorted === "asc"}
              onClick={() => column.toggleSorting(false)}
            >
              <ChevronUp />
              Sort asc
            </DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem
              checked={sorted === "desc"}
              onClick={() => column.toggleSorting(true)}
            >
              <ChevronDown />
              Sort desc
            </DropdownMenuCheckboxItem>
            {sorted && (
              <DropdownMenuItem onClick={() => column.clearSorting()}>
                <X />
                Remove sort
              </DropdownMenuItem>
            )}
          </>
        )}
        {column.getCanHide() && (
          <>
            {column.getCanSort() && <DropdownMenuSeparator />}
            <DropdownMenuItem onClick={() => column.toggleVisibility(false)}>
              <EyeOff />
              Hide column
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
