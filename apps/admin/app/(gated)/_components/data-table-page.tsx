import type { ReactNode } from "react"
import Link from "next/link"

import { DataTable, type ColumnDef } from "./data-table"

export interface DataTablePageProps {
  /** Kept for source compatibility; the shell content-header shows the title. */
  title?: string
  description?: string
  breadcrumb?: string
  columns: ColumnDef[]
  rows: Array<Record<string, unknown>>
  pagination?: { pageIndex: number; pageSize: number; totalRows: number }
  pageHrefBuilder?: (pageIndex: number) => string
  /** Toolbar-left content — search + filters (the `Filters` block). */
  filters?: ReactNode
  /** Toolbar-right content — primary actions (export, create, …). */
  toolbar?: ReactNode
  exportable?: boolean
  auditPrefix: string
  emptyTitle?: string
  emptyDescription?: string
}

/**
 * Admin list surface. A sticky toolbar (filters left, actions right), a clean
 * card-wrapped table with a sticky header, and a sticky footer status bar
 * (row count + pager). The page title is owned by the shell content-header, so
 * no in-body H1 here — only an optional one-line description.
 */
export function DataTablePage({
  description,
  columns,
  rows,
  pagination,
  pageHrefBuilder,
  filters,
  toolbar,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Try adjusting filters.",
}: DataTablePageProps) {
  const pg = pagination ?? { pageIndex: 0, pageSize: 0, totalRows: 0 }
  const totalPages = Math.max(
    1,
    Math.ceil(pg.totalRows / Math.max(1, pg.pageSize)),
  )
  const current = pg.pageIndex
  const hasToolbar = Boolean(filters || toolbar)

  return (
    <div className="flex min-h-full flex-col">
      {hasToolbar && (
        <div className="sticky top-0 z-10 flex flex-wrap items-center gap-2 border-b border-border-subtle bg-canvas px-4 py-2.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
            {filters}
          </div>
          {toolbar && (
            <div className="flex shrink-0 items-center gap-2">{toolbar}</div>
          )}
        </div>
      )}

      <div className="flex-1 px-4 py-4">
        {description && (
          <p className="mb-3 text-sm text-muted-foreground">{description}</p>
        )}
        <DataTable
          columns={columns}
          rows={rows}
          emptyTitle={emptyTitle}
          emptyDescription={emptyDescription}
        />
      </div>

      {pageHrefBuilder && (
        <div className="sticky bottom-0 z-10 flex items-center justify-between border-t border-border-subtle bg-canvas px-4 py-2 text-xs text-muted-foreground">
          <span>
            Page {current + 1} of {totalPages}
            {pg.totalRows > 0
              ? ` · ${pg.totalRows.toLocaleString()} total`
              : ""}
          </span>
          <div className="flex items-center gap-1">
            <PagerLink
              href={current > 0 ? pageHrefBuilder(current - 1) : undefined}
            >
              Previous
            </PagerLink>
            <PagerLink
              href={
                current + 1 < totalPages
                  ? pageHrefBuilder(current + 1)
                  : undefined
              }
            >
              Next
            </PagerLink>
          </div>
        </div>
      )}
    </div>
  )
}

function PagerLink({ href, children }: { href?: string; children: ReactNode }) {
  if (!href) {
    return (
      <span className="rounded-md border border-border-subtle px-2 py-1 opacity-40">
        {children}
      </span>
    )
  }
  return (
    <Link
      href={href}
      className="rounded-md border border-border-subtle px-2 py-1 transition-colors hover:bg-muted hover:text-foreground"
    >
      {children}
    </Link>
  )
}
