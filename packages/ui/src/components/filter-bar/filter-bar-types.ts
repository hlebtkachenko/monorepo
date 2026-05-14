import type { LucideIcon } from "@workspace/ui/lib/icons"

export type ElementType<T> = T extends (infer U)[] ? U : T

export type Nullable<T> = T | null | undefined

export interface ColumnOption {
  label: string
  value: string
  icon?: React.ReactElement | React.ElementType
}

export interface ColumnOptionExtended extends ColumnOption {
  selected?: boolean
  count?: number
}

export type ColumnDataType =
  | "text"
  | "number"
  | "date"
  | "option"
  | "multiOption"

export type OptionBasedColumnDataType = Extract<
  ColumnDataType,
  "option" | "multiOption"
>

export type ColumnDataNativeMap = {
  text: string
  number: number
  date: Date
  option: string
  multiOption: string[]
}

export type FilterValues<T extends ColumnDataType> = Array<
  ElementType<ColumnDataNativeMap[T]>
>

export type TAccessorFn<TData, TVal = unknown> = (data: TData) => TVal

export type TTransformOptionFn<TVal = unknown> = (
  value: ElementType<NonNullable<TVal>>,
) => ColumnOption

export type TOrderFn<TVal = unknown> = (
  a: ElementType<NonNullable<TVal>>,
  b: ElementType<NonNullable<TVal>>,
) => number

export type ColumnConfig<
  TData,
  TType extends ColumnDataType = ColumnDataType,
  TVal = unknown,
  TId extends string = string,
> = {
  id: TId
  accessor: TAccessorFn<TData, TVal>
  displayName: string
  icon: LucideIcon
  iconColor?: string
  type: TType
  options?: TType extends OptionBasedColumnDataType ? ColumnOption[] : never
  facetedOptions?: TType extends OptionBasedColumnDataType
    ? Map<string, number>
    : never
  min?: TType extends "number" ? number : never
  max?: TType extends "number" ? number : never
  transformOptionFn?: TType extends OptionBasedColumnDataType
    ? TTransformOptionFn<TVal>
    : never
  orderFn?: TType extends OptionBasedColumnDataType ? TOrderFn<TVal> : never
}

export type OptionColumnId<T> =
  T extends ColumnConfig<
    infer _TData,
    "option" | "multiOption",
    infer _TVal,
    infer TId
  >
    ? TId
    : never

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type OptionColumnIds<
  T extends ReadonlyArray<ColumnConfig<any, any, any, any>>,
> = {
  [K in keyof T]: OptionColumnId<T[K]>
}[number]

export type NumberColumnId<T> =
  T extends ColumnConfig<infer _TData, "number", infer _TVal, infer TId>
    ? TId
    : never

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type NumberColumnIds<
  T extends ReadonlyArray<ColumnConfig<any, any, any, any>>,
> = {
  [K in keyof T]: NumberColumnId<T[K]>
}[number]

export type DataTableFilterConfig<TData> = {
  data: TData[]
  columns: ColumnConfig<TData>[]
}

export type ColumnProperties<TData, TVal> = {
  getOptions: () => ColumnOption[]
  getValues: () => ElementType<NonNullable<TVal>>[]
  getFacetedUniqueValues: () => Map<string, number> | undefined
  getFacetedMinMaxValues: () => [number, number] | undefined
  prefetchOptions: () => Promise<void>
  prefetchValues: () => Promise<void>
  prefetchFacetedUniqueValues: () => Promise<void>
  prefetchFacetedMinMaxValues: () => Promise<void>
}

export type ColumnPrivateProperties<TData, TVal> = {
  _prefetchedOptionsCache: ColumnOption[] | null
  _prefetchedValuesCache: ElementType<NonNullable<TVal>>[] | null
  _prefetchedFacetedUniqueValuesCache: Map<string, number> | null
  _prefetchedFacetedMinMaxValuesCache: [number, number] | null
}

export type Column<
  TData,
  TType extends ColumnDataType = ColumnDataType,
  TVal = unknown,
> = ColumnConfig<TData, TType, TVal> &
  ColumnProperties<TData, TVal> &
  ColumnPrivateProperties<TData, TVal>

export interface DataTableFilterActions {
  addFilterValue: <TData, TType extends OptionBasedColumnDataType>(
    column: Column<TData, TType>,
    values: FilterModel<TType>["values"],
  ) => void

  removeFilterValue: <TData, TType extends OptionBasedColumnDataType>(
    column: Column<TData, TType>,
    value: FilterModel<TType>["values"],
  ) => void

  setFilterValue: <TData, TType extends ColumnDataType>(
    column: Column<TData, TType>,
    values: FilterModel<TType>["values"],
  ) => void

  setFilterOperator: <TType extends ColumnDataType>(
    columnId: string,
    operator: FilterModel<TType>["operator"],
  ) => void

  removeFilter: (columnId: string) => void

  removeAllFilters: () => void
}

export type FilterStrategy = "client" | "server"

export type TextFilterOperator = "contains" | "does not contain"

export type NumberFilterOperator =
  | "is"
  | "is not"
  | "is less than"
  | "is greater than or equal to"
  | "is greater than"
  | "is less than or equal to"
  | "is between"
  | "is not between"

export type DateFilterOperator =
  | "is"
  | "is not"
  | "is before"
  | "is on or after"
  | "is after"
  | "is on or before"
  | "is between"
  | "is not between"

export type OptionFilterOperator = "is" | "is not" | "is any of" | "is none of"

export type MultiOptionFilterOperator =
  | "include"
  | "exclude"
  | "include any of"
  | "include all of"
  | "exclude if any of"
  | "exclude if all"

export type FilterOperators = {
  text: TextFilterOperator
  number: NumberFilterOperator
  date: DateFilterOperator
  option: OptionFilterOperator
  multiOption: MultiOptionFilterOperator
}

export type FilterModel<TType extends ColumnDataType = ColumnDataType> = {
  columnId: string
  type: TType
  operator: FilterOperators[TType]
  values: FilterValues<TType>
}

export type FiltersState = Array<FilterModel>

export type FilterDetails<T extends ColumnDataType> = {
  [key in FilterOperators[T]]: FilterOperatorDetails<key, T>
}

export type FilterOperatorTarget = "single" | "multiple"

export type FilterOperatorDetailsBase<
  OperatorValue,
  T extends ColumnDataType,
> = {
  key: string
  value: OperatorValue
  target: FilterOperatorTarget
  singularOf?: FilterOperators[T]
  pluralOf?: FilterOperators[T]
  relativeOf: FilterOperators[T] | Array<FilterOperators[T]>
  isNegated: boolean
  negation?: FilterOperators[T]
  negationOf?: FilterOperators[T]
}

export type FilterOperatorDetails<
  OperatorValue,
  T extends ColumnDataType,
> = FilterOperatorDetailsBase<OperatorValue, T> &
  (
    | { singularOf?: never; pluralOf?: never }
    | { target: "single"; singularOf: FilterOperators[T]; pluralOf?: never }
    | { target: "multiple"; singularOf?: never; pluralOf: FilterOperators[T] }
  ) &
  (
    | { isNegated: false; negation: FilterOperators[T]; negationOf?: never }
    | { isNegated: true; negation?: never; negationOf: FilterOperators[T] }
  )

export type FilterTypeOperatorDetails = {
  [key in ColumnDataType]: FilterDetails<key>
}

export type FilterBarStrings = {
  filter: string
  clear: string
  search: string
  noResults: string
  operators: string
  and: string
  single: string
  range: string
  value: string
  min: string
  max: string
  /** Map of operator key to display label. */
  operatorLabels: Record<string, string>
}

export const FILTER_BAR_DEFAULT_STRINGS: FilterBarStrings = {
  filter: "Filter",
  clear: "Clear",
  search: "Search...",
  noResults: "No results.",
  operators: "Operators",
  and: "and",
  single: "Single",
  range: "Range",
  value: "Value",
  min: "Min",
  max: "Max",
  operatorLabels: {
    "filters.option.is": "is",
    "filters.option.isNot": "is not",
    "filters.option.isAnyOf": "is any of",
    "filters.option.isNoneOf": "is none of",
    "filters.multiOption.include": "includes",
    "filters.multiOption.exclude": "excludes",
    "filters.multiOption.includeAnyOf": "includes any of",
    "filters.multiOption.excludeIfAll": "excludes if all of",
    "filters.multiOption.includeAllOf": "includes all of",
    "filters.multiOption.excludeIfAnyOf": "excludes if any of",
    "filters.date.is": "is",
    "filters.date.isNot": "is not",
    "filters.date.isBefore": "is before",
    "filters.date.isOnOrAfter": "is on or after",
    "filters.date.isAfter": "is after",
    "filters.date.isOnOrBefore": "is on or before",
    "filters.date.isBetween": "is between",
    "filters.date.isNotBetween": "is not between",
    "filters.text.contains": "contains",
    "filters.text.doesNotContain": "does not contain",
    "filters.number.is": "is",
    "filters.number.isNot": "is not",
    "filters.number.greaterThan": "greater than",
    "filters.number.greaterThanOrEqual": "greater than or equal",
    "filters.number.lessThan": "less than",
    "filters.number.lessThanOrEqual": "less than or equal",
    "filters.number.isBetween": "is between",
    "filters.number.isNotBetween": "is not between",
  },
}
