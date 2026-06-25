"use client"

import * as React from "react"
import type { Table } from "@tanstack/react-table"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { Sigma } from "@workspace/ui/lib/icons"
import { useIcons } from "@workspace/ui/icon-packs"

import { formatMoney, type InvoiceRow } from "./data"

const PAGE_SIZE_OPTIONS = [10, 20, 50]
const EXPORT_FORMATS = ["CSV", "PDF", "XLSX"]

export interface ContentDemoStatusBarProps {
  table: Table<InvoiceRow>
  /** Count of currently visible (filtered) rows. */
  visibleCount: number
  /** Sum of the visible rows' amounts. */
  total: number
  /** Whether any filter / search narrows the dataset. */
  isFiltered: boolean
  /** Re-derive the table data without clearing filters or reloading the page. */
  onReload: () => void
  /** Mock export — wired to a toast for now. */
  onExport: (format: string) => void
}

/**
 * The single Content Panel status bar — a 36px band pinned to the panel bottom.
 * Left: pagination (page position, navigation, page-size), a divider, the
 * visible row count (+ a "Filtered" badge), then the running sum. Right: an
 * Export split button, a History button (not wired yet), and a Reload button.
 *
 * While mounted it publishes `--app-statusbar-clearance` so the floating
 * ActionBar and Sonner toasts both clear the bar instead of overlapping it.
 */
export function ContentDemoStatusBar({
  table,
  visibleCount,
  total,
  isFiltered,
  onReload,
  onExport,
}: ContentDemoStatusBarProps) {
  const icons = useIcons()
  const FirstIcon = icons.ChevronsLeft
  const PrevIcon = icons.ChevronLeft
  const NextIcon = icons.ChevronRight
  const LastIcon = icons.ChevronsRight
  const DownloadIcon = icons.Download
  const ChevronIcon = icons.ChevronDown
  const HistoryIcon = icons.History
  const ReloadIcon = icons.RefreshCw

  const pageSize = table.getState().pagination.pageSize
  const pageIndex = table.getState().pagination.pageIndex
  const pageCount = Math.max(table.getPageCount(), 1)

  // Publish this bar's clearance (its 36px height + an 8px gap above the shell
  // inset) while mounted. The floating ActionBar and the global Toaster both
  // read `--app-statusbar-clearance` so the geometry lives in exactly one place
  // — here, the bar that owns the height.
  React.useEffect(() => {
    const root = document.documentElement
    root.style.setProperty(
      "--app-statusbar-clearance",
      "calc(var(--shell-bottom-inset) + 36px + 8px)",
    )
    return () => {
      root.style.removeProperty("--app-statusbar-clearance")
    }
  }, [])

  return (
    <TooltipProvider delayDuration={200}>
      <div
        data-slot="content-demo-status-bar"
        className="flex h-9 shrink-0 items-center gap-4 border-t border-border-subtle px-2 text-xs text-muted-foreground"
      >
        {/* Pagination — position, navigation, then the page-size dropdown. */}
        <div className="flex items-center gap-2">
          <span className="whitespace-nowrap">
            Page {pageIndex + 1} of {pageCount}
          </span>
          <div className="flex items-center gap-1">
            <Button
              aria-label="Go to first page"
              variant="outline"
              size="icon-sm"
              onClick={() => table.setPageIndex(0)}
              disabled={!table.getCanPreviousPage()}
            >
              <FirstIcon />
            </Button>
            <Button
              aria-label="Go to previous page"
              variant="outline"
              size="icon-sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <PrevIcon />
            </Button>
            <Button
              aria-label="Go to next page"
              variant="outline"
              size="icon-sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <NextIcon />
            </Button>
            <Button
              aria-label="Go to last page"
              variant="outline"
              size="icon-sm"
              onClick={() => table.setPageIndex(pageCount - 1)}
              disabled={!table.getCanNextPage()}
            >
              <LastIcon />
            </Button>
          </div>
          <Select
            value={`${pageSize}`}
            onValueChange={(value) => table.setPageSize(Number(value))}
          >
            <Tooltip>
              <TooltipTrigger asChild>
                <SelectTrigger
                  size="sm"
                  className="w-[60px] text-xs"
                  aria-label="Rows per page"
                >
                  <SelectValue placeholder={pageSize} />
                </SelectTrigger>
              </TooltipTrigger>
              <TooltipContent side="top">Rows per page</TooltipContent>
            </Tooltip>
            <SelectContent side="top">
              {PAGE_SIZE_OPTIONS.map((option) => (
                <SelectItem key={option} value={`${option}`}>
                  {option}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 24px divider, centred, with a 16px gap each side (parent gap-4). */}
        <Separator
          orientation="vertical"
          inset
          className="!h-6 bg-border-subtle"
        />

        {/* Visible row count (selection lives in the ActionBar, not here). */}
        <div className="flex items-center gap-1.5">
          <span>
            {visibleCount} {visibleCount === 1 ? "row" : "rows"}
          </span>
          {isFiltered ? (
            <Badge variant="secondary" className="h-5">
              Filtered
            </Badge>
          ) : null}
        </div>

        {/* Running sum of the visible rows. */}
        <div className="flex items-center gap-1.5">
          <Sigma className="size-3.5" aria-hidden />
          <span>
            <span className="sr-only">Sum: </span>
            {formatMoney(total)}
          </span>
        </div>

        {/* Right cluster — export / history / reload. */}
        <div className="ml-auto flex items-center gap-1.5">
          <ButtonGroup>
            <Button variant="outline" size="sm">
              <DownloadIcon />
              Export
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-sm"
                  aria-label="Choose export format"
                >
                  <ChevronIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="min-w-32">
                <DropdownMenuLabel>Export as</DropdownMenuLabel>
                {EXPORT_FORMATS.map((format) => (
                  <DropdownMenuItem
                    key={format}
                    onSelect={() => onExport(format)}
                  >
                    {format}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          </ButtonGroup>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="outline" size="icon-sm" aria-label="History">
                <HistoryIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">History</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon-sm"
                aria-label="Reload"
                onClick={onReload}
              >
                <ReloadIcon />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="top">Reload</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </TooltipProvider>
  )
}
