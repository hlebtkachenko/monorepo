"use client"

import * as React from "react"
import { Ellipsis, PlusIcon } from "@workspace/ui/lib/icons"
import {
  endOfDay,
  endOfMonth,
  endOfQuarter,
  endOfWeek,
  format,
  isEqual,
  isSameDay,
  startOfDay,
  startOfMonth,
  startOfQuarter,
  startOfWeek,
  subMonths,
  subQuarters,
  subWeeks,
} from "date-fns"
import type { DateRange } from "react-day-picker"
import { Badge } from "@workspace/ui/components/badge"
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
import {
  formatNumber,
  maskNumberInput,
  parseNumber,
} from "@workspace/ui/lib/format-number"
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
  OptionBasedColumnDataType,
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
      // `[&>svg]:hidden` drops CommandItem's built-in trailing check icon — it
      // also carries `ml-auto`, and two auto-margins in one flex row split the
      // free space, stranding the count badge mid-row instead of the right edge.
      className="group flex items-center gap-1.5 [&>svg]:hidden"
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
        <span>{label}</span>
      </div>
      {/* Count of matching rows — pinned to the column's right edge (`ml-auto`),
          not hugging the label. The list min-width (on the controller's Command)
          gives it a column to align in. */}
      {typeof count === "number" && count > 0 ? (
        <Badge variant="secondary" className="ml-auto shrink-0 tabular-nums">
          {count < 100 ? count : "100+"}
        </Badge>
      ) : null}
    </CommandItem>
  )
})

/** A row (rendered per option controller) shown by the `creatable` columns for a
 *  typed value with no match: selecting it mints the value as a filter value. */
function CreateOptionItem({
  query,
  onCreate,
}: {
  query: string
  onCreate: (value: string) => void
}) {
  const value = query.trim()
  return (
    <CommandGroup forceMount>
      <CommandItem
        // cmdk scores an item by its `value` vs the search text; prefixing keeps
        // this row from colliding with a real option of the same name, and
        // `forceMount` keeps it visible regardless of the fuzzy filter.
        value={`__create__${value}`}
        forceMount
        onSelect={() => onCreate(value)}
        className="gap-1.5 [&>svg]:hidden"
      >
        <PlusIcon className="size-4 shrink-0 text-muted-foreground" />
        <span>{`Create "${value}"`}</span>
      </CommandItem>
    </CommandGroup>
  )
}

/** The option controller's initial list: the column's own options plus any active
 *  filter value NOT among them (a value minted earlier via "Create …") so it still
 *  shows as selected when the popover is reopened. */
function initialFilterOptions<TData, TType extends OptionBasedColumnDataType>(
  column: Column<TData, TType>,
  values: readonly string[] | undefined,
): (ColumnOptionExtended & { initialSelected: boolean })[] {
  const counts = column.getFacetedUniqueValues()
  const base = column.getOptions().map((o) => ({
    ...o,
    selected: !!values?.includes(o.value),
    initialSelected: !!values?.includes(o.value),
    count: counts?.get(o.value) ?? 0,
  }))
  if (column.creatable && values) {
    const known = new Set(base.map((o) => o.value))
    for (const v of values)
      if (!known.has(v))
        base.push({
          value: v,
          label: v,
          selected: true,
          initialSelected: true,
          count: 0,
        })
  }
  return base
}

/** Whether the creatable "Create …" row should show for the current query. */
function canCreateFilterOption<TData, TType extends OptionBasedColumnDataType>(
  column: Column<TData, TType>,
  query: string,
  options: readonly { value: string; label: string }[],
): boolean {
  if (!column.creatable) return false
  const q = query.trim().toLowerCase()
  if (q === "") return false
  return !options.some(
    (o) => o.value.toLowerCase() === q || o.label.toLowerCase() === q,
  )
}

export function FilterValueOptionController<TData>({
  filter,
  column,
  actions,
  strings = FILTER_BAR_DEFAULT_STRINGS,
}: FilterValueControllerProps<TData, "option">) {
  // Snapshot of options at mount time — drives the initial selection state.
  // Deliberately memoized with no deps so reordering on selection changes
  // doesn't reshuffle the visible list inside the popover.
  const initialOptions = React.useMemo(
    () => initialFilterOptions(column, filter?.values),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [options, setOptions] = React.useState(initialOptions)
  const [query, setQuery] = React.useState("")

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

  const createOption = React.useCallback(
    (raw: string) => {
      const value = raw.trim()
      if (value === "") return
      setOptions((prev) =>
        prev.some((o) => o.value === value)
          ? prev
          : [
              ...prev,
              {
                value,
                label: value,
                selected: true,
                initialSelected: true,
                count: 0,
              },
            ],
      )
      actions.addFilterValue(column, [value])
      setQuery("")
    },
    [actions, column],
  )

  const showCreate = canCreateFilterOption(column, query, options)

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
    <Command loop className="min-w-56">
      <CommandInput
        autoFocus
        placeholder={strings.search}
        value={query}
        onValueChange={setQuery}
      />
      {showCreate ? null : <CommandEmpty>{strings.noResults}</CommandEmpty>}
      <CommandList className="max-h-fit">
        {showCreate ? (
          <CreateOptionItem query={query} onCreate={createOption} />
        ) : null}
        <CommandGroup className={cn(selectedOptions.length === 0 && "hidden")}>
          {selectedOptions.map((option) => (
            <OptionItem
              key={option.value}
              option={option}
              onToggle={handleToggle}
            />
          ))}
        </CommandGroup>
        {/* Only bracket the two groups with a divider when BOTH exist. Otherwise
            (nothing was selected when the popover opened) a lone separator hangs
            directly under the search box. Grouping stays snapshot-at-open, so it
            never reshuffles mid-session. */}
        {selectedOptions.length > 0 && unselectedOptions.length > 0 ? (
          <CommandSeparator />
        ) : null}
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
  const initialOptions = React.useMemo(
    () => initialFilterOptions(column, filter?.values),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const [options, setOptions] = React.useState(initialOptions)
  const [query, setQuery] = React.useState("")

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

  const createOption = React.useCallback(
    (raw: string) => {
      const value = raw.trim()
      if (value === "") return
      setOptions((prev) =>
        prev.some((o) => o.value === value)
          ? prev
          : [
              ...prev,
              {
                value,
                label: value,
                selected: true,
                initialSelected: true,
                count: 0,
              },
            ],
      )
      actions.addFilterValue(column, [value])
      setQuery("")
    },
    [actions, column],
  )

  const showCreate = canCreateFilterOption(column, query, options)

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
    <Command loop className="min-w-56">
      <CommandInput
        autoFocus
        placeholder={strings.search}
        value={query}
        onValueChange={setQuery}
      />
      {showCreate ? null : <CommandEmpty>{strings.noResults}</CommandEmpty>}
      <CommandList>
        {showCreate ? (
          <CreateOptionItem query={query} onCreate={createOption} />
        ) : null}
        <CommandGroup className={cn(selectedOptions.length === 0 && "hidden")}>
          {selectedOptions.map((option) => (
            <OptionItem
              key={option.value}
              option={option}
              onToggle={handleToggle}
            />
          ))}
        </CommandGroup>
        {/* Divider only when both groups exist (see the option controller). */}
        {selectedOptions.length > 0 && unselectedOptions.length > 0 ? (
          <CommandSeparator />
        ) : null}
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

// Range presets for the date filter's left column. Each returns a [start, end]
// window relative to now, evaluated on click (never at module load).
const DATE_RANGE_PRESETS: { label: string; getRange: () => [Date, Date] }[] = [
  {
    label: "Today",
    getRange: () => [startOfDay(new Date()), endOfDay(new Date())],
  },
  {
    label: "This week",
    getRange: () => [startOfWeek(new Date()), endOfWeek(new Date())],
  },
  {
    label: "Last week",
    getRange: () => {
      const ref = subWeeks(new Date(), 1)
      return [startOfWeek(ref), endOfWeek(ref)]
    },
  },
  {
    label: "This month",
    getRange: () => [startOfMonth(new Date()), endOfMonth(new Date())],
  },
  {
    label: "Last 3 months",
    getRange: () => [
      startOfMonth(subMonths(new Date(), 2)),
      endOfMonth(new Date()),
    ],
  },
  {
    label: "This quarter",
    getRange: () => [startOfQuarter(new Date()), endOfQuarter(new Date())],
  },
  {
    label: "Last quarter",
    getRange: () => {
      const ref = subQuarters(new Date(), 1)
      return [startOfQuarter(ref), endOfQuarter(ref)]
    },
  },
]

export function FilterValueDateController<TData>({
  filter,
  column,
  actions,
}: FilterValueControllerProps<TData, "date">) {
  const [date, setDate] = React.useState<DateRange | undefined>({
    from: filter?.values[0] ?? undefined,
    to: filter?.values[1] ?? undefined,
  })

  const applyRange = React.useCallback(
    (from: Date | undefined, to: Date | undefined) => {
      setDate({ from, to })
      const values = from && to ? [from, to] : from ? [from] : []
      if (values.length === 2)
        actions.setFilterOperator(column.id, "is between")
      if (values.length > 0) actions.setFilterValue(column, values)
    },
    [actions, column.id],
  )

  function changeDateRange(value: DateRange | undefined) {
    const start = value?.from
    const end =
      start && value?.to && !isEqual(start, value.to) ? value.to : undefined
    applyRange(start, end)
  }

  const activePreset = DATE_RANGE_PRESETS.find((preset) => {
    if (!date?.from || !date?.to) return false
    const [start, end] = preset.getRange()
    return isSameDay(start, date.from) && isSameDay(end, date.to)
  })

  // Left preset column (grey surface, dark-grey outline on the active preset,
  // red Clear) + our range Calendar on the right.
  return (
    <div className="flex w-fit">
      <div className="flex w-40 flex-col gap-0.5 border-r bg-muted/50 p-2">
        {DATE_RANGE_PRESETS.map((preset) => {
          const active = activePreset?.label === preset.label
          return (
            <button
              key={preset.label}
              type="button"
              onClick={() => {
                const [start, end] = preset.getRange()
                applyRange(start, end)
              }}
              className={cn(
                "rounded-md px-2.5 py-1.5 text-left text-sm transition-colors hover:bg-muted",
                active && "bg-background ring-1 ring-foreground/30",
              )}
            >
              {preset.label}
            </button>
          )
        })}
        <button
          type="button"
          onClick={() => {
            setDate(undefined)
            actions.removeFilter(column.id)
          }}
          className="mt-1 rounded-md px-2.5 py-1.5 text-left text-sm text-destructive transition-colors hover:bg-destructive/10"
        >
          Clear
        </button>
      </div>
      <div className="p-3">
        <Calendar
          autoFocus
          mode="range"
          captionLayout="dropdown"
          defaultMonth={date?.from}
          startMonth={new Date(new Date().getFullYear() - 5, 0)}
          endMonth={new Date(new Date().getFullYear() + 1, 11)}
          selected={date}
          onSelect={changeDateRange}
          numberOfMonths={1}
        />
      </div>
    </div>
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
  const inputRef = React.useRef<HTMLInputElement>(null)
  const caretRef = React.useRef<number | null>(null)
  const [draft, setDraft] = React.useState<string>(() => formatNumber(value))

  React.useEffect(() => {
    setDraft(formatNumber(value))
  }, [value])

  // Restore the caret after a masked re-format shifts the text (e.g. a thousand
  // separator or the ",00" suffix was inserted to the left of the caret).
  React.useLayoutEffect(() => {
    if (caretRef.current === null || !inputRef.current) return
    const pos = caretRef.current
    inputRef.current.setSelectionRange(pos, pos)
    caretRef.current = null
  }, [draft])

  // Live formatting: group thousands and keep a ",00" suffix as the user types,
  // preserving the caret. The numeric value is only committed on blur / Enter —
  // committing per keystroke re-rounded the draft and looked like a +0.01 step.
  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const el = event.target
    const masked = maskNumberInput(
      el.value,
      el.selectionStart ?? el.value.length,
    )
    caretRef.current = masked.caret
    setDraft(masked.text)
  }

  const commit = () => {
    const parsed = parseNumber(draft)
    if (parsed === null) setDraft(formatNumber(value))
    else {
      setDraft(formatNumber(parsed))
      onCommit(parsed)
    }
  }

  return (
    <Input
      id={id}
      ref={inputRef}
      inputMode="decimal"
      value={draft}
      onChange={handleChange}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault()
          commit()
        }
      }}
      className="min-w-0 flex-1"
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
      <CommandList className="w-44 px-2 py-2">
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
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-xs font-medium">
                      {strings.min}
                    </span>
                    <FormattedNumberInput
                      value={values[0] ?? 0}
                      onCommit={changeMinNumber}
                    />
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-8 shrink-0 text-xs font-medium">
                      {strings.max}
                    </span>
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
