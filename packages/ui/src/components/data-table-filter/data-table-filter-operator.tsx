"use client"

import * as React from "react"
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
import {
  dateFilterOperators,
  filterTypeOperatorDetails,
  multiOptionFilterOperators,
  numberFilterOperators,
  optionFilterOperators,
  textFilterOperators,
} from "./data-table-filter-core"
import type {
  Column,
  ColumnDataType,
  DataTableFilterActions,
  DataTableFilterStrings,
  FilterModel,
  FilterOperators,
} from "./data-table-filter-types"
import { DEFAULT_STRINGS } from "./data-table-filter-types"

interface FilterOperatorProps<TData, TType extends ColumnDataType> {
  column: Column<TData, TType>
  filter: FilterModel<TType>
  actions: DataTableFilterActions
  strings?: DataTableFilterStrings
}

export function FilterOperator<TData, TType extends ColumnDataType>({
  column,
  filter,
  actions,
  strings = DEFAULT_STRINGS,
}: FilterOperatorProps<TData, TType>) {
  const [open, setOpen] = React.useState<boolean>(false)
  const close = () => setOpen(false)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-slot="data-table-filter-operator"
          variant="ghost"
          className="m-0 h-full w-fit rounded-none p-0 px-2 text-xs whitespace-nowrap"
        >
          <FilterOperatorDisplay
            filter={filter}
            columnType={column.type}
            strings={strings}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-fit origin-(--radix-popover-content-transform-origin) border border-border bg-popover p-0 text-popover-foreground"
      >
        <Command loop>
          <CommandInput placeholder={strings.search} />
          <CommandEmpty>{strings.noResults}</CommandEmpty>
          <CommandList className="max-h-fit">
            <FilterOperatorController
              filter={filter}
              column={column}
              actions={actions}
              closeController={close}
              strings={strings}
            />
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

interface FilterOperatorDisplayProps<TType extends ColumnDataType> {
  filter: FilterModel<TType>
  columnType: TType
  strings?: DataTableFilterStrings
}

export function FilterOperatorDisplay<TType extends ColumnDataType>({
  filter,
  columnType,
  strings = DEFAULT_STRINGS,
}: FilterOperatorDisplayProps<TType>) {
  const operator = filterTypeOperatorDetails[columnType][
    filter.operator as keyof (typeof filterTypeOperatorDetails)[TType]
  ] as { key: string }
  const label = strings.operatorLabels[operator.key] ?? operator.key

  return <span className="text-muted-foreground">{label}</span>
}

interface FilterOperatorControllerProps<TData, TType extends ColumnDataType> {
  filter: FilterModel<TType>
  column: Column<TData, TType>
  actions: DataTableFilterActions
  closeController: () => void
  strings?: DataTableFilterStrings
}

export function FilterOperatorController<TData, TType extends ColumnDataType>({
  filter,
  column,
  actions,
  closeController,
  strings = DEFAULT_STRINGS,
}: FilterOperatorControllerProps<TData, TType>) {
  switch (column.type) {
    case "option":
      return (
        <OperatorList
          filter={filter}
          column={column}
          actions={actions}
          closeController={closeController}
          operators={optionFilterOperators}
          strings={strings}
        />
      )
    case "multiOption":
      return (
        <OperatorList
          filter={filter}
          column={column}
          actions={actions}
          closeController={closeController}
          operators={multiOptionFilterOperators}
          strings={strings}
        />
      )
    case "date":
      return (
        <OperatorList
          filter={filter}
          column={column}
          actions={actions}
          closeController={closeController}
          operators={dateFilterOperators}
          strings={strings}
          hideHeading
        />
      )
    case "text":
      return (
        <OperatorList
          filter={filter}
          column={column}
          actions={actions}
          closeController={closeController}
          operators={textFilterOperators}
          strings={strings}
        />
      )
    case "number":
      return (
        <OperatorList
          filter={filter}
          column={column}
          actions={actions}
          closeController={closeController}
          operators={numberFilterOperators}
          strings={strings}
        />
      )
    default:
      return null
  }
}

type AnyOperatorDetails = {
  key: string
  value: string
  target: "single" | "multiple"
}

function OperatorList<TData, TType extends ColumnDataType>({
  filter,
  column,
  actions,
  closeController,
  operators,
  strings,
  hideHeading,
}: FilterOperatorControllerProps<TData, TType> & {
  operators: Record<string, AnyOperatorDetails>
  hideHeading?: boolean
}) {
  const filterDetails = operators[filter.operator as string]!
  const relatedFilters = Object.values(operators).filter(
    (o) => o.target === filterDetails.target,
  )

  const changeOperator = (value: string) => {
    actions?.setFilterOperator(
      column.id,
      value as FilterOperators[ColumnDataType],
    )
    closeController()
  }

  return (
    <CommandGroup heading={hideHeading ? undefined : strings?.operators}>
      {relatedFilters.map((r) => (
        <CommandItem onSelect={changeOperator} value={r.value} key={r.value}>
          {strings?.operatorLabels[r.key] ?? r.key}
        </CommandItem>
      ))}
    </CommandGroup>
  )
}
