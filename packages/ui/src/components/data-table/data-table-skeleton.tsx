import { cn } from "@workspace/ui/lib/utils"
import { Skeleton } from "@workspace/ui/components/skeleton"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

interface DataTableSkeletonProps extends React.ComponentProps<"div"> {
  columnCount: number
  rowCount?: number
  filterCount?: number
  cellWidths?: string[]
  withViewOptions?: boolean
  withPagination?: boolean
  shrinkZero?: boolean
}

export function DataTableSkeleton({
  columnCount,
  rowCount = 10,
  filterCount = 0,
  cellWidths = ["auto"],
  withViewOptions = true,
  withPagination = true,
  shrinkZero = false,
  className,
  ...props
}: DataTableSkeletonProps) {
  const cozyCellWidths = Array.from(
    { length: columnCount },
    (_, index) => cellWidths[index % cellWidths.length] ?? "auto",
  )

  return (
    <div
      data-slot="data-table-skeleton"
      className={cn("flex w-full flex-col gap-2.5 overflow-auto", className)}
      {...props}
    >
      <div
        data-slot="data-table-skeleton-toolbar"
        className="flex w-full items-center justify-between gap-2 overflow-auto p-1"
      >
        <div className="flex flex-1 items-center gap-2">
          {filterCount > 0
            ? Array.from({ length: filterCount }).map((_, index) => (
                <Skeleton
                  // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
                  key={`filter-${index}`}
                  className="h-7 w-[72px] border-dashed"
                />
              ))
            : null}
        </div>
        {withViewOptions ? (
          <Skeleton className="ml-auto hidden h-7 w-[72px] lg:flex" />
        ) : null}
      </div>
      <div
        data-slot="data-table-skeleton-container"
        className="overflow-hidden rounded-md border"
      >
        <Table>
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {Array.from({ length: columnCount }).map((_, index) => (
                <TableHead
                  // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
                  key={`head-${index}`}
                  style={{
                    width: cozyCellWidths[index],
                    minWidth: shrinkZero ? cozyCellWidths[index] : "auto",
                  }}
                >
                  <Skeleton className="h-6 w-full" />
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {Array.from({ length: rowCount }).map((_, rowIndex) => (
              <TableRow
                // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
                key={`row-${rowIndex}`}
                className="hover:bg-transparent"
              >
                {Array.from({ length: columnCount }).map((_, cellIndex) => (
                  <TableCell
                    // biome-ignore lint/suspicious/noArrayIndexKey: static placeholder list
                    key={`cell-${rowIndex}-${cellIndex}`}
                    style={{
                      width: cozyCellWidths[cellIndex],
                      minWidth: shrinkZero ? cozyCellWidths[cellIndex] : "auto",
                    }}
                  >
                    <Skeleton className="h-6 w-full" />
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {withPagination ? (
        <div
          data-slot="data-table-skeleton-pagination"
          className="flex w-full items-center justify-between gap-4 overflow-auto p-1 sm:gap-8"
        >
          <Skeleton className="h-7 w-40 shrink-0" />
          <div className="flex items-center gap-4 sm:gap-6 lg:gap-8">
            <div className="flex items-center gap-2">
              <Skeleton className="h-7 w-24" />
              <Skeleton className="h-7 w-[72px]" />
            </div>
            <div className="flex items-center justify-center text-sm font-medium">
              <Skeleton className="h-7 w-20" />
            </div>
            <div className="flex items-center gap-2">
              <Skeleton className="hidden size-7 lg:block" />
              <Skeleton className="size-7" />
              <Skeleton className="size-7" />
              <Skeleton className="hidden size-7 lg:block" />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
