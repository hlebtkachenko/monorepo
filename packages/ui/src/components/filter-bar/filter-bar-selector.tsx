"use client"

import * as React from "react"
import {
  ArrowRightIcon,
  ChevronRightIcon,
  ListFilter,
} from "@workspace/ui/lib/icons"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Checkbox } from "@workspace/ui/components/checkbox"
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
import { cn } from "@workspace/ui/lib/utils"
import { getColumn, isAnyOf } from "./filter-bar-helpers"
import { FilterValueController } from "./filter-bar-value"
import type {
  Column,
  ColumnDataType,
  DataTableFilterActions,
  FilterBarStrings,
  FilterStrategy,
  FiltersState,
} from "./filter-bar-types"
import { FILTER_BAR_DEFAULT_STRINGS } from "./filter-bar-types"

interface FilterSelectorProps<TData> {
  filters: FiltersState
  columns: Column<TData>[]
  actions: DataTableFilterActions
  strategy: FilterStrategy
  strings?: FilterBarStrings
  /** Controlled open state — lets a consumer open the selector imperatively. */
  open?: boolean
  onOpenChange?: (open: boolean) => void
  /** Controlled active column — jumps straight to that column's value editor. */
  property?: string
  onPropertyChange?: (property: string | undefined) => void
  /** Trigger button size — defaults to `sm` for the standalone filter bar. */
  size?: React.ComponentProps<typeof Button>["size"]
  /**
   * Keep the text label on the trigger even once filters are applied. Off by
   * default (the standalone bar collapses to the icon to save space); the
   * ContentToolbar turns it on so the "Add filter" affordance never vanishes.
   */
  alwaysShowLabel?: boolean
}

function FilterSelectorImpl<TData>({
  filters,
  columns,
  actions,
  strategy,
  strings = FILTER_BAR_DEFAULT_STRINGS,
  open: openProp,
  onOpenChange,
  property: propertyProp,
  onPropertyChange,
  size = "sm",
  alwaysShowLabel = false,
}: FilterSelectorProps<TData>) {
  const [openState, setOpenState] = React.useState(false)
  const open = openProp ?? openState
  const setOpen = React.useCallback(
    (next: boolean) => {
      setOpenState(next)
      onOpenChange?.(next)
    },
    [onOpenChange],
  )
  const [value, setValue] = React.useState("")
  const [propertyState, setPropertyState] = React.useState<string | undefined>(
    undefined,
  )
  const property = propertyProp !== undefined ? propertyProp : propertyState
  const setProperty = React.useCallback(
    (next: string | undefined) => {
      setPropertyState(next)
      onPropertyChange?.(next)
    },
    [onPropertyChange],
  )
  const inputRef = React.useRef<HTMLInputElement>(null)

  const column = property ? getColumn(columns, property) : undefined
  const filter = property
    ? filters.find((f) => f.columnId === property)
    : undefined

  const hasFilters = filters.length > 0

  React.useEffect(() => {
    if (property && inputRef) {
      inputRef.current?.focus()
      setValue("")
    }
  }, [property])

  React.useEffect(() => {
    if (!open) setTimeout(() => setValue(""), 150)
  }, [open])

  const content = React.useMemo(
    () =>
      property && column ? (
        <div>
          {/* Clarify which column is being filtered (the value step otherwise
              shows only a bare search box). */}
          <div className="flex items-center gap-1.5 border-b px-2.5 py-2 text-sm font-medium">
            <column.icon className="size-4 shrink-0 text-muted-foreground" />
            <span className="truncate">{column.displayName}</span>
          </div>
          <FilterValueController
            filter={filter!}
            column={column as Column<TData, ColumnDataType>}
            actions={actions}
            strategy={strategy}
            strings={strings}
          />
        </div>
      ) : (
        <Command
          loop
          filter={(value, search, keywords) => {
            const extendValue = `${value} ${keywords?.join(" ")}`
            return extendValue.toLowerCase().includes(search.toLowerCase())
              ? 1
              : 0
          }}
        >
          <CommandInput
            value={value}
            onValueChange={setValue}
            ref={inputRef}
            placeholder={strings.search}
          />
          <CommandEmpty>{strings.noResults}</CommandEmpty>
          <CommandList className="max-h-fit">
            <CommandGroup>
              {columns.map((c) => (
                <FilterableColumn
                  key={c.id}
                  column={c}
                  setProperty={setProperty}
                />
              ))}
              <QuickSearchFilters
                search={value}
                filters={filters}
                columns={columns}
                actions={actions}
              />
            </CommandGroup>
          </CommandList>
        </Command>
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [property, column, filter, filters, columns, actions, value],
  )

  return (
    <Popover
      open={open}
      onOpenChange={(v) => {
        setOpen(v)
        if (!v) setTimeout(() => setProperty(undefined), 100)
      }}
    >
      <PopoverTrigger asChild>
        <Button
          data-slot="filter-bar-selector"
          variant="outline"
          size={size}
          className={cn(hasFilters && !alwaysShowLabel && "w-fit !px-2")}
        >
          <ListFilter className="size-4" />
          {(!hasFilters || alwaysShowLabel) && <span>{strings.filter}</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-fit origin-(--radix-popover-content-transform-origin) border border-border bg-popover p-0 text-popover-foreground"
      >
        {content}
      </PopoverContent>
    </Popover>
  )
}

export const FilterSelector = React.memo(
  FilterSelectorImpl,
) as typeof FilterSelectorImpl

export function FilterableColumn<TData, TType extends ColumnDataType, TVal>({
  column,
  setProperty,
}: {
  column: Column<TData, TType, TVal>
  setProperty: (value: string) => void
}) {
  const itemRef = React.useRef<HTMLDivElement>(null)

  const prefetch = React.useCallback(() => {
    void column.prefetchOptions()
    void column.prefetchValues()
    void column.prefetchFacetedUniqueValues()
    void column.prefetchFacetedMinMaxValues()
  }, [column])

  React.useEffect(() => {
    const target = itemRef.current
    if (!target) return

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === "attributes") {
          const isSelected = target.getAttribute("data-selected") === "true"
          if (isSelected) prefetch()
        }
      }
    })

    observer.observe(target, {
      attributes: true,
      attributeFilter: ["data-selected"],
    })

    return () => observer.disconnect()
  }, [prefetch])

  return (
    <CommandItem
      ref={itemRef}
      value={column.id}
      keywords={[column.displayName]}
      onSelect={() => setProperty(column.id)}
      className="group"
      onMouseEnter={prefetch}
    >
      <div className="flex w-full items-center justify-between">
        <div className="inline-flex items-center gap-1.5">
          <span
            className="flex items-center"
            style={column.iconColor ? { color: column.iconColor } : undefined}
          >
            <column.icon strokeWidth={2.25} className="size-4" />
          </span>
          <span>{column.displayName}</span>
        </div>
        <ArrowRightIcon className="size-4 opacity-0 group-aria-selected:opacity-100" />
      </div>
    </CommandItem>
  )
}

interface QuickSearchFiltersProps<TData> {
  search?: string
  filters: FiltersState
  columns: Column<TData>[]
  actions: DataTableFilterActions
}

function QuickSearchFiltersImpl<TData>({
  search,
  filters,
  columns,
  actions,
}: QuickSearchFiltersProps<TData>) {
  const cols = React.useMemo(
    () =>
      columns.filter((c) =>
        isAnyOf<ColumnDataType>(c.type, ["option", "multiOption"]),
      ),
    [columns],
  )

  if (!search || search.trim().length < 2) return null

  return (
    <>
      {cols.map((column) => {
        const filter = filters.find((f) => f.columnId === column.id)
        const options = column.getOptions()
        const optionsCount = column.getFacetedUniqueValues()

        function handleOptionSelect(value: string, check: boolean) {
          if (check)
            actions.addFilterValue(
              column as Column<TData, "option" | "multiOption">,
              [value],
            )
          else
            actions.removeFilterValue(
              column as Column<TData, "option" | "multiOption">,
              [value],
            )
        }

        return (
          <React.Fragment key={column.id}>
            {options.map((v) => {
              const checked = Boolean(filter?.values.includes(v.value))
              const count = optionsCount?.get(v.value) ?? 0

              return (
                <CommandItem
                  key={v.value}
                  value={v.value}
                  keywords={[v.label, v.value]}
                  onSelect={() => handleOptionSelect(v.value, !checked)}
                  className="group"
                >
                  <div className="group flex w-full items-center gap-1.5">
                    <Checkbox
                      checked={checked}
                      className="mr-1 opacity-0 group-data-[selected=true]:opacity-100 data-[state=checked]:opacity-100 dark:border-ring"
                    />
                    <div className="flex w-4 items-center justify-center">
                      {v.icon &&
                        (React.isValidElement(v.icon) ? (
                          v.icon
                        ) : (
                          <v.icon className="size-4 text-primary" />
                        ))}
                    </div>
                    <div className="flex items-center gap-0.5">
                      <span className="text-muted-foreground">
                        {column.displayName}
                      </span>
                      <ChevronRightIcon className="size-3.5 text-muted-foreground/75" />
                      <span>{v.label}</span>
                    </div>
                    {/* Number of matching rows — a trailing count badge, same
                        treatment as the sidebar nav counts. */}
                    {optionsCount && count > 0 ? (
                      <Badge
                        variant="secondary"
                        className="ml-auto shrink-0 tabular-nums"
                      >
                        {count < 100 ? count : "100+"}
                      </Badge>
                    ) : null}
                  </div>
                </CommandItem>
              )
            })}
          </React.Fragment>
        )
      })}
    </>
  )
}

export const QuickSearchFilters = React.memo(
  QuickSearchFiltersImpl,
) as typeof QuickSearchFiltersImpl
