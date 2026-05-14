"use client"

import * as React from "react"
import { Ellipsis } from "@workspace/ui/lib/icons"
import { format, isEqual } from "date-fns"
import type { DateRange } from "react-day-picker"
import { Button } from "@workspace/ui/components/button"
import { Calendar } from "@workspace/ui/components/calendar"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Input } from "@workspace/ui/components/input"
import { Slider } from "@workspace/ui/components/slider"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"
import { formatNumber, parseNumber } from "@workspace/ui/lib/format-number"
import { numberFilterOperators } from "./filter-bar-core"
import { createNumberRange, take } from "./filter-bar-helpers"
import { DebouncedInput } from "./filter-bar-debounced-input"
import type {
  Column,
  ColumnDataType,
  ColumnOptionExtended,
  DataTableFilterActions,
  FilterBarStrings,
  FilterModel,
  FilterStrategy,
} from "./filter-bar-types"
import { FILTER_BAR_DEFAULT_STRINGS } from "./filter-bar-types"

interface FilterValueProps<TData, TType extends ColumnDataType> {
  filter: FilterModel<TType>
  column: Column<TData, TType>
  actions: DataTableFilterActions
  strategy: FilterStrategy
  strings?: FilterBarStrings
}

export function FilterValue<TData, TType extends ColumnDataType>({
  filter,
  column,
  actions,
  strategy,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: FilterValueProps<TData, TType>) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          data-slot="filter-bar-value"
          variant="ghost"
          className="m-0 h-full w-fit rounded-none p-0 px-2 text-xs whitespace-nowrap"
        >
          <FilterValueDisplay
            filter={filter}
            column={column}
            actions={actions}
            strings={strings}
          />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-fit origin-(--radix-popover-content-transform-origin) border border-border bg-popover p-0 text-popover-foreground"
      >
        <FilterValueController
          filter={filter}
          column={column}
          actions={actions}
          strategy={strategy}
          strings={strings}
        />
      </PopoverContent>
    </Popover>
  )
}

interface FilterValueDisplayProps<TData, TType extends ColumnDataType> {
  filter: FilterModel<TType>
  column: Column<TData, TType>
  actions: DataTableFilterActions
  strings?: FilterBarStrings
}

export function FilterValueDisplay<TData, TType extends ColumnDataType>({
  filter,
  column,
  actions,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: FilterValueDisplayProps<TData, TType>) {
  switch (column.type) {
    case "option":
      return (
        <FilterValueOptionDisplay
          filter={filter as unknown as FilterModel<"option">}
          column={column as unknown as Column<TData, "option">}
          actions={actions}
          strings={strings}
        />
      )
    case "multiOption":
      return (
        <FilterValueMultiOptionDisplay
          filter={filter as unknown as FilterModel<"multiOption">}
          column={column as unknown as Column<TData, "multiOption">}
          actions={actions}
          strings={strings}
        />
      )
    case "date":
      return (
        <FilterValueDateDisplay
          filter={filter as unknown as FilterModel<"date">}
        />
      )
    case "text":
      return (
        <FilterValueTextDisplay
          filter={filter as unknown as FilterModel<"text">}
        />
      )
    case "number":
      return (
        <FilterValueNumberDisplay
          filter={filter as unknown as FilterModel<"number">}
          strings={strings}
        />
      )
    default:
      return null
  }
}

export function FilterValueOptionDisplay<TData>({
  filter,
  column,
}: FilterValueDisplayProps<TData, "option">) {
  const options = React.useMemo(() => column.getOptions(), [column])
  const selected = options.filter((o) => filter?.values.includes(o.value))

  if (selected.length === 1) {
    const { label, icon: Icon } = selected[0]!
    const hasIcon = !!Icon
    return (
      <span className="inline-flex items-center gap-1">
        {hasIcon &&
          (React.isValidElement(Icon) ? (
            Icon
          ) : (
            <Icon className="size-4 text-primary" />
          ))}
        <span>{label}</span>
      </span>
    )
  }
  const name = column.displayName.toLowerCase()
  const pluralName = name.endsWith("s") ? `${name}es` : `${name}s`

  const hasOptionIcons = !options?.some((o) => !o.icon)

  return (
    <div className="inline-flex items-center gap-0.5">
      {hasOptionIcons &&
        take(selected, 3).map(({ value, icon }) => {
          const Icon = icon!
          return React.isValidElement(Icon) ? (
            Icon
          ) : (
            <Icon key={value} className="size-4" />
          )
        })}
      <span className={cn(hasOptionIcons && "ml-1.5")}>
        {selected.length} {pluralName}
      </span>
    </div>
  )
}

export function FilterValueMultiOptionDisplay<TData>({
  filter,
  column,
}: FilterValueDisplayProps<TData, "multiOption">) {
  const options = React.useMemo(() => column.getOptions(), [column])
  const selected = options.filter((o) => filter.values.includes(o.value))

  if (selected.length === 1) {
    const { label, icon: Icon } = selected[0]!
    const hasIcon = !!Icon
    return (
      <span className="inline-flex items-center gap-1.5">
        {hasIcon &&
          (React.isValidElement(Icon) ? (
            Icon
          ) : (
            <Icon className="size-4 text-primary" />
          ))}
        <span>{label}</span>
      </span>
    )
  }

  const name = column.displayName.toLowerCase()
  const hasOptionIcons = !options?.some((o) => !o.icon)

  return (
    <div className="inline-flex items-center gap-1.5">
      {hasOptionIcons && (
        <div key="icons" className="inline-flex items-center gap-0.5">
          {take(selected, 3).map(({ value, icon }) => {
            const Icon = icon!
            return React.isValidElement(Icon) ? (
              React.cloneElement(Icon, { key: value })
            ) : (
              <Icon key={value} className="size-4" />
            )
          })}
        </div>
      )}
      <span>
        {selected.length} {name}
      </span>
    </div>
  )
}

function formatDateRange(start: Date, end: Date) {
  const sameMonth = start.getMonth() === end.getMonth()
  const sameYear = start.getFullYear() === end.getFullYear()

  if (sameMonth && sameYear) {
    return `${format(start, "MMM d")} - ${format(end, "d, yyyy")}`
  }
  if (sameYear) {
    return `${format(start, "MMM d")} - ${format(end, "MMM d, yyyy")}`
  }
  return `${format(start, "MMM d, yyyy")} - ${format(end, "MMM d, yyyy")}`
}

export function FilterValueDateDisplay({
  filter,
}: {
  filter: FilterModel<"date">
}) {
  if (!filter) return null
  if (filter.values.length === 0) return <Ellipsis className="size-4" />
  if (filter.values.length === 1) {
    const value = filter.values[0]!
    return <span>{format(value, "MMM d, yyyy")}</span>
  }
  return <span>{formatDateRange(filter.values[0]!, filter.values[1]!)}</span>
}

export function FilterValueTextDisplay({
  filter,
}: {
  filter: FilterModel<"text">
}) {
  if (!filter) return null
  if (filter.values.length === 0 || filter.values[0]!.trim() === "") {
    return <Ellipsis className="size-4" />
  }
  return <span>{filter.values[0]}</span>
}

export function FilterValueNumberDisplay({
  filter,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: {
  filter: FilterModel<"number">
  strings?: FilterBarStrings
}) {
  if (!filter || !filter.values || filter.values.length === 0) return null

  if (
    filter.operator === "is between" ||
    filter.operator === "is not between"
  ) {
    return (
      <span className="tracking-tight tabular-nums">
        {formatNumber(filter.values[0])} {strings.and}{" "}
        {formatNumber(filter.values[1])}
      </span>
    )
  }
  return (
    <span className="tracking-tight tabular-nums">
      {formatNumber(filter.values[0])}
    </span>
  )
}

/* ---------------- value controllers ---------------- */

interface FilterValueControllerProps<TData, TType extends ColumnDataType> {
  filter: FilterModel<TType>
  column: Column<TData, TType>
  actions: DataTableFilterActions
  strategy: FilterStrategy
  strings?: FilterBarStrings
}

export function FilterValueController<TData, TType extends ColumnDataType>({
  filter,
  column,
  actions,
  strategy,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: FilterValueControllerProps<TData, TType>) {
  switch (column.type) {
    case "option":
      return (
        <FilterValueOptionController
          filter={filter as unknown as FilterModel<"option">}
          column={column as unknown as Column<TData, "option">}
          actions={actions}
          strategy={strategy}
          strings={strings}
        />
      )
    case "multiOption":
      return (
        <FilterValueMultiOptionController
          filter={filter as unknown as FilterModel<"multiOption">}
          column={column as unknown as Column<TData, "multiOption">}
          actions={actions}
          strategy={strategy}
          strings={strings}
        />
      )
    case "date":
      return (
        <FilterValueDateController
          filter={filter as unknown as FilterModel<"date">}
          column={column as unknown as Column<TData, "date">}
          actions={actions}
          strategy={strategy}
        />
      )
    case "text":
      return (
        <FilterValueTextController
          filter={filter as unknown as FilterModel<"text">}
          column={column as unknown as Column<TData, "text">}
          actions={actions}
          strategy={strategy}
          strings={strings}
        />
      )
    case "number":
      return (
        <FilterValueNumberController
          filter={filter as unknown as FilterModel<"number">}
          column={column as unknown as Column<TData, "number">}
          actions={actions}
          strategy={strategy}
          strings={strings}
        />
      )
    default:
      return null
  }
}

interface OptionItemProps {
  option: ColumnOptionExtended & { initialSelected: boolean }
  onToggle: (value: string, checked: boolean) => void
}

const OptionItem = React.memo(function OptionItem({
  option,
  onToggle,
}: OptionItemProps) {
  const { value, label, icon: Icon, selected, count } = option
  const handleSelect = React.useCallback(() => {
    onToggle(value, !selected)
  }, [onToggle, value, selected])

  return (
    <CommandItem
      key={value}
      onSelect={handleSelect}
      className="group flex items-center justify-between gap-1.5"
    >
      <div className="flex items-center gap-1.5">
        <Checkbox
          checked={selected}
          className="mr-1 opacity-0 group-data-[selected=true]:opacity-100 data-[state=checked]:opacity-100 dark:border-ring"
        />
        {Icon &&
          (React.isValidElement(Icon) ? (
            Icon
          ) : (
            <Icon className="size-4 text-primary" />
          ))}
        <span>
          {label}
          <sup
            className={cn(
              count == null && "hidden",
              "ml-0.5 tracking-tight text-muted-foreground tabular-nums",
              count === 0 && "slashed-zero",
            )}
          >
            {typeof count === "number" ? (count < 100 ? count : "100+") : ""}
          </sup>
        </span>
      </div>
    </CommandItem>
  )
})

export function FilterValueOptionController<TData>({
  filter,
  column,
  actions,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: FilterValueControllerProps<TData, "option">) {
  // Snapshot of options at mount time — drives the initial selection state.
  // Deliberately memoized with no deps so reordering on selection changes
  // doesn't reshuffle the visible list inside the popover.
  const initialOptions = React.useMemo(() => {
    const counts = column.getFacetedUniqueValues()
    return column.getOptions().map((o) => ({
      ...o,
      selected: filter?.values.includes(o.value),
      initialSelected: !!filter?.values.includes(o.value),
      count: counts?.get(o.value) ?? 0,
    }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [options, setOptions] = React.useState(initialOptions)

  React.useEffect(() => {
    setOptions((prev) =>
      prev.map((o) => ({ ...o, selected: filter?.values.includes(o.value) })),
    )
  }, [filter?.values])

  const handleToggle = React.useCallback(
    (value: string, checked: boolean) => {
      if (checked) actions.addFilterValue(column, [value])
      else actions.removeFilterValue(column, [value])
    },
    [actions, column],
  )

  const { selectedOptions, unselectedOptions } = React.useMemo(() => {
    const sel: typeof options = []
    const unsel: typeof options = []
    for (const o of options) {
      if (o.initialSelected) sel.push(o)
      else unsel.push(o)
    }
    return { selectedOptions: sel, unselectedOptions: unsel }
  }, [options])

  return (
    <Command loop>
      <CommandInput autoFocus placeholder={strings.search} />
      <CommandEmpty>{strings.noResults}</CommandEmpty>
      <CommandList className="max-h-fit">
        <CommandGroup className={cn(selectedOptions.length === 0 && "hidden")}>
          {selectedOptions.map((option) => (
            <OptionItem
              key={option.value}
              option={option}
              onToggle={handleToggle}
            />
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup
          className={cn(unselectedOptions.length === 0 && "hidden")}
        >
          {unselectedOptions.map((option) => (
            <OptionItem
              key={option.value}
              option={option}
              onToggle={handleToggle}
            />
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

export function FilterValueMultiOptionController<TData>({
  filter,
  column,
  actions,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: FilterValueControllerProps<TData, "multiOption">) {
  // Snapshot of options at mount time — drives the initial selection state.
  // Deliberately memoized with no deps so reordering on selection changes
  // doesn't reshuffle the visible list inside the popover.
  const initialOptions = React.useMemo(() => {
    const counts = column.getFacetedUniqueValues()
    return column.getOptions().map((o) => {
      const selected = !!filter?.values.includes(o.value)
      return {
        ...o,
        selected,
        initialSelected: selected,
        count: counts?.get(o.value) ?? 0,
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const [options, setOptions] = React.useState(initialOptions)

  React.useEffect(() => {
    setOptions((prev) =>
      prev.map((o) => ({ ...o, selected: filter?.values.includes(o.value) })),
    )
  }, [filter?.values])

  const handleToggle = React.useCallback(
    (value: string, checked: boolean) => {
      if (checked) actions.addFilterValue(column, [value])
      else actions.removeFilterValue(column, [value])
    },
    [actions, column],
  )

  const { selectedOptions, unselectedOptions } = React.useMemo(() => {
    const sel: typeof options = []
    const unsel: typeof options = []
    for (const o of options) {
      if (o.initialSelected) sel.push(o)
      else unsel.push(o)
    }
    return { selectedOptions: sel, unselectedOptions: unsel }
  }, [options])

  return (
    <Command loop>
      <CommandInput autoFocus placeholder={strings.search} />
      <CommandEmpty>{strings.noResults}</CommandEmpty>
      <CommandList>
        <CommandGroup className={cn(selectedOptions.length === 0 && "hidden")}>
          {selectedOptions.map((option) => (
            <OptionItem
              key={option.value}
              option={option}
              onToggle={handleToggle}
            />
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup
          className={cn(unselectedOptions.length === 0 && "hidden")}
        >
          {unselectedOptions.map((option) => (
            <OptionItem
              key={option.value}
              option={option}
              onToggle={handleToggle}
            />
          ))}
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

export function FilterValueDateController<TData>({
  filter,
  column,
  actions,
}: FilterValueControllerProps<TData, "date">) {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: filter?.values[0] ?? new Date(),
    to: filter?.values[1] ?? undefined,
  })

  function changeDateRange(value: DateRange | undefined) {
    const start = value?.from
    const end =
      start && value && value.to && !isEqual(start, value.to)
        ? value.to
        : undefined

    setDate({ from: start, to: end })

    const isRange = start && end
    const newValues = isRange ? [start, end] : start ? [start] : []

    actions.setFilterValue(column, newValues)
  }

  return (
    <Command>
      <CommandList className="max-h-fit">
        <CommandGroup>
          <div>
            <Calendar
              autoFocus
              mode="range"
              defaultMonth={date?.from}
              selected={date}
              onSelect={changeDateRange}
              numberOfMonths={1}
            />
          </div>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

export function FilterValueTextController<TData>({
  filter,
  column,
  actions,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: FilterValueControllerProps<TData, "text">) {
  const changeText = (value: string | number) => {
    actions.setFilterValue(column, [String(value)])
  }

  return (
    <Command>
      <CommandList className="max-h-fit">
        <CommandGroup>
          <CommandItem>
            <DebouncedInput
              placeholder={strings.search}
              autoFocus
              value={filter?.values[0] ?? ""}
              onChange={changeText}
            />
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}

interface FormattedNumberInputProps {
  id?: string
  value: number
  onCommit: (value: number) => void
}

function FormattedNumberInput({
  id,
  value,
  onCommit,
}: FormattedNumberInputProps) {
  const [draft, setDraft] = React.useState<string>(() => formatNumber(value))

  React.useEffect(() => {
    setDraft(formatNumber(value))
  }, [value])

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const next = event.target.value
    setDraft(next)
    const parsed = parseNumber(next)
    if (parsed !== null) onCommit(parsed)
  }

  const handleBlur = () => {
    const parsed = parseNumber(draft)
    if (parsed === null) setDraft(formatNumber(value))
    else setDraft(formatNumber(parsed))
  }

  return (
    <Input
      id={id}
      inputMode="decimal"
      value={draft}
      onChange={handleChange}
      onBlur={handleBlur}
      className="min-w-[10rem]"
    />
  )
}

export function FilterValueNumberController<TData>({
  filter,
  column,
  actions,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: FilterValueControllerProps<TData, "number">) {
  const minMax = React.useMemo(() => column.getFacetedMinMaxValues(), [column])
  const [sliderMin, sliderMax] = [
    minMax ? minMax[0] : 0,
    minMax ? minMax[1] : 0,
  ]

  const [values, setValues] = React.useState<number[]>(filter?.values ?? [0, 0])

  React.useEffect(() => {
    if (
      filter?.values &&
      filter.values.length === values.length &&
      filter.values.every((v, i) => v === values[i])
    ) {
      setValues(filter.values)
    }
  }, [filter?.values, values])

  const isNumberRange =
    filter && numberFilterOperators[filter.operator].target === "multiple"

  const changeNumber = (value: number[]) => {
    setValues(value)
    actions.setFilterValue(column, value)
  }

  const changeMinNumber = (value: number) => {
    const newValues = createNumberRange([value, values[1] ?? 0])
    setValues(newValues)
    actions.setFilterValue(column, newValues)
  }

  const changeMaxNumber = (value: number) => {
    const newValues = createNumberRange([values[0] ?? 0, value])
    setValues(newValues)
    actions.setFilterValue(column, newValues)
  }

  const changeType = React.useCallback(
    (type: "single" | "range") => {
      let newValues: number[] = []
      if (type === "single") {
        newValues = [values[0] ?? 0]
      } else if (!minMax) {
        newValues = createNumberRange([values[0] ?? 0, values[1] ?? 0])
      } else {
        const value = values[0] ?? 0
        newValues =
          value - minMax[0] < minMax[1] - value
            ? createNumberRange([value, minMax[1]])
            : createNumberRange([minMax[0], value])
      }

      const newOperator = type === "single" ? "is" : "is between"

      setValues(newValues)
      actions.setFilterOperator(column.id, newOperator)
      actions.setFilterValue(column, newValues)
    },
    [values, column, actions, minMax],
  )

  return (
    <Command>
      <CommandList className="w-[300px] px-2 py-2">
        <CommandGroup>
          <div className="flex w-full flex-col">
            <Tabs
              value={isNumberRange ? "range" : "single"}
              onValueChange={(v) => changeType(v as "single" | "range")}
            >
              <TabsList className="w-full *:text-xs">
                <TabsTrigger value="single">{strings.single}</TabsTrigger>
                <TabsTrigger value="range">{strings.range}</TabsTrigger>
              </TabsList>
              <TabsContent value="single" className="mt-4 flex flex-col gap-4">
                {minMax && (
                  <Slider
                    value={[values[0] ?? 0]}
                    onValueChange={(value) => changeNumber(value)}
                    min={sliderMin}
                    max={sliderMax}
                    step={1}
                    aria-orientation="horizontal"
                  />
                )}
                <div className="flex items-center gap-2">
                  <span className="text-xs font-medium">{strings.value}</span>
                  <FormattedNumberInput
                    id="single"
                    value={values[0] ?? 0}
                    onCommit={(v) => changeNumber([v])}
                  />
                </div>
              </TabsContent>
              <TabsContent value="range" className="mt-4 flex flex-col gap-4">
                {minMax && (
                  <Slider
                    value={values}
                    onValueChange={changeNumber}
                    min={sliderMin}
                    max={sliderMax}
                    step={1}
                    aria-orientation="horizontal"
                  />
                )}
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{strings.min}</span>
                    <FormattedNumberInput
                      value={values[0] ?? 0}
                      onCommit={changeMinNumber}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium">{strings.max}</span>
                    <FormattedNumberInput
                      value={values[1] ?? 0}
                      onCommit={changeMaxNumber}
                    />
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
