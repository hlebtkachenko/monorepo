import {
  endOfDay,
  isAfter,
  isBefore,
  isSameDay,
  isWithinInterval,
  startOfDay,
} from "date-fns"
import type {
  Column,
  ColumnConfig,
  ColumnDataType,
  ColumnOption,
  ElementType,
  FilterDetails,
  FilterModel,
  FilterOperatorTarget,
  FilterOperators,
  FilterStrategy,
  FilterTypeOperatorDetails,
  FilterValues,
  Nullable,
} from "./filter-bar-types"
import {
  intersection,
  isAnyOf,
  isColumnOptionArray,
  memo,
  uniq,
} from "./filter-bar-helpers"

/* --------------------------- column builder ------------------------------ */

class ColumnConfigBuilder<
  TData,
  TType extends ColumnDataType,
  TVal = unknown,
  TId extends string = string,
> {
  private config: Partial<ColumnConfig<TData, TType, TVal, TId>>

  constructor(type: TType) {
    this.config = { type } as Partial<ColumnConfig<TData, TType, TVal, TId>>
  }

  private clone(): ColumnConfigBuilder<TData, TType, TVal, TId> {
    const newInstance = new ColumnConfigBuilder<TData, TType, TVal, TId>(
      this.config.type as TType,
    )
    newInstance.config = { ...this.config }
    return newInstance
  }

  id<TNewId extends string>(
    value: TNewId,
  ): ColumnConfigBuilder<TData, TType, TVal, TNewId> {
    const newInstance = this.clone() as unknown as ColumnConfigBuilder<
      TData,
      TType,
      TVal,
      TNewId
    >
    ;(newInstance as unknown as { config: { id: TNewId } }).config.id = value
    return newInstance
  }

  accessor<TNewVal>(
    accessor: (data: TData) => TNewVal,
  ): ColumnConfigBuilder<TData, TType, TNewVal, TId> {
    const newInstance = this.clone() as unknown as ColumnConfigBuilder<
      TData,
      TType,
      TNewVal,
      TId
    >
    ;(
      newInstance as unknown as {
        config: { accessor: (data: TData) => TNewVal }
      }
    ).config.accessor = accessor
    return newInstance
  }

  displayName(value: string): ColumnConfigBuilder<TData, TType, TVal, TId> {
    const newInstance = this.clone()
    newInstance.config.displayName = value
    return newInstance
  }

  icon(
    value: NonNullable<ColumnConfig<TData, TType, TVal, TId>["icon"]>,
  ): ColumnConfigBuilder<TData, TType, TVal, TId> {
    const newInstance = this.clone()
    newInstance.config.icon = value
    return newInstance
  }

  iconColor(value: string): ColumnConfigBuilder<TData, TType, TVal, TId> {
    const newInstance = this.clone()
    newInstance.config.iconColor = value
    return newInstance
  }

  min(value: number): ColumnConfigBuilder<TData, TType, TVal, TId> {
    if (this.config.type !== "number") {
      throw new Error("min() is only applicable to number columns")
    }
    const newInstance = this.clone()
    ;(newInstance.config as { min?: number }).min = value
    return newInstance
  }

  max(value: number): ColumnConfigBuilder<TData, TType, TVal, TId> {
    if (this.config.type !== "number") {
      throw new Error("max() is only applicable to number columns")
    }
    const newInstance = this.clone()
    ;(newInstance.config as { max?: number }).max = value
    return newInstance
  }

  options(value: ColumnOption[]): ColumnConfigBuilder<TData, TType, TVal, TId> {
    if (!isAnyOf(this.config.type, ["option", "multiOption"])) {
      throw new Error(
        "options() is only applicable to option or multiOption columns",
      )
    }
    const newInstance = this.clone()
    ;(newInstance.config as { options?: ColumnOption[] }).options = value
    return newInstance
  }

  transformOptionFn(
    fn: (value: ElementType<NonNullable<TVal>>) => ColumnOption,
  ): ColumnConfigBuilder<TData, TType, TVal, TId> {
    if (!isAnyOf(this.config.type, ["option", "multiOption"])) {
      throw new Error(
        "transformOptionFn() is only applicable to option or multiOption columns",
      )
    }
    const newInstance = this.clone()
    ;(
      newInstance.config as {
        transformOptionFn?: (
          value: ElementType<NonNullable<TVal>>,
        ) => ColumnOption
      }
    ).transformOptionFn = fn
    return newInstance
  }

  orderFn(
    fn: (
      a: ElementType<NonNullable<TVal>>,
      b: ElementType<NonNullable<TVal>>,
    ) => number,
  ): ColumnConfigBuilder<TData, TType, TVal, TId> {
    if (!isAnyOf(this.config.type, ["option", "multiOption"])) {
      throw new Error(
        "orderFn() is only applicable to option or multiOption columns",
      )
    }
    const newInstance = this.clone()
    ;(
      newInstance.config as {
        orderFn?: (
          a: ElementType<NonNullable<TVal>>,
          b: ElementType<NonNullable<TVal>>,
        ) => number
      }
    ).orderFn = fn
    return newInstance
  }

  build(): ColumnConfig<TData, TType, TVal, TId> {
    if (!this.config.id) throw new Error("id is required")
    if (!this.config.accessor) throw new Error("accessor is required")
    if (!this.config.displayName) throw new Error("displayName is required")
    if (!this.config.icon) throw new Error("icon is required")
    return this.config as ColumnConfig<TData, TType, TVal, TId>
  }
}

interface FluentColumnConfigHelper<TData> {
  text: () => ColumnConfigBuilder<TData, "text", string>
  number: () => ColumnConfigBuilder<TData, "number", number>
  date: () => ColumnConfigBuilder<TData, "date", Date>
  option: () => ColumnConfigBuilder<TData, "option", string>
  multiOption: () => ColumnConfigBuilder<TData, "multiOption", string[]>
}

export function createColumnConfigHelper<
  TData,
>(): FluentColumnConfigHelper<TData> {
  return {
    text: () => new ColumnConfigBuilder<TData, "text", string>("text"),
    number: () => new ColumnConfigBuilder<TData, "number", number>("number"),
    date: () => new ColumnConfigBuilder<TData, "date", Date>("date"),
    option: () => new ColumnConfigBuilder<TData, "option", string>("option"),
    multiOption: () =>
      new ColumnConfigBuilder<TData, "multiOption", string[]>("multiOption"),
  }
}

/* --------------------------- column factories ---------------------------- */

export function getColumnOptions<TData, TType extends ColumnDataType, TVal>(
  column: ColumnConfig<TData, TType, TVal>,
  data: TData[],
  strategy: FilterStrategy,
): ColumnOption[] {
  if (!isAnyOf(column.type, ["option", "multiOption"])) {
    return []
  }

  if (strategy === "server" && !column.options) {
    throw new Error("column options are required for server-side filtering")
  }

  if (column.options) {
    return column.options
  }

  const filtered = data
    .flatMap(column.accessor)
    .filter((v): v is NonNullable<TVal> => v !== undefined && v !== null)

  let models = uniq(filtered)

  if (column.orderFn) {
    models = models.sort((m1, m2) =>
      column.orderFn!(
        m1 as ElementType<NonNullable<TVal>>,
        m2 as ElementType<NonNullable<TVal>>,
      ),
    )
  }

  if (column.transformOptionFn) {
    const transform = column.transformOptionFn
    const memoizedTransform = memo(
      () => [models],
      (deps) =>
        (deps[0] as TVal[]).map((m) =>
          transform(m as ElementType<NonNullable<TVal>>),
        ),
      { key: `transform-${column.id}` },
    )
    return memoizedTransform()
  }

  if (isColumnOptionArray(models)) return models

  throw new Error(
    `[filter-bar] [${column.id}] Either provide static options, a transformOptionFn, or ensure the column data conforms to ColumnOption type`,
  )
}

export function getColumnValues<TData, TType extends ColumnDataType, TVal>(
  column: ColumnConfig<TData, TType, TVal>,
  data: TData[],
): unknown[] {
  const memoizedAccessor = memo(
    () => [data],
    (deps) =>
      (deps[0] as TData[])
        .flatMap(column.accessor)
        .filter(
          (v): v is NonNullable<TVal> => v !== undefined && v !== null,
        ) as ElementType<NonNullable<TVal>>[],
    { key: `accessor-${column.id}` },
  )

  const raw = memoizedAccessor()

  if (!isAnyOf(column.type, ["option", "multiOption"])) {
    return raw
  }

  if (column.options) {
    const options = column.options
    return raw
      .map(
        (v) => options.find((o) => o.value === (v as unknown as string))?.value,
      )
      .filter((v): v is string => v !== undefined && v !== null)
  }

  if (column.transformOptionFn) {
    const transform = column.transformOptionFn
    const memoizedTransform = memo(
      () => [raw],
      (deps) =>
        (deps[0] as ElementType<NonNullable<TVal>>[]).map(
          (v) => transform(v) as ColumnOption,
        ),
      { key: `transform-values-${column.id}` },
    )
    return memoizedTransform()
  }

  if (isColumnOptionArray(raw)) {
    return raw
  }

  throw new Error(
    `[filter-bar] [${column.id}] Either provide static options, a transformOptionFn, or ensure the column data conforms to ColumnOption type`,
  )
}

export function getFacetedUniqueValues<
  TData,
  TType extends ColumnDataType,
  TVal,
>(
  column: ColumnConfig<TData, TType, TVal>,
  values: string[] | ColumnOption[],
  strategy: FilterStrategy,
): Map<string, number> | undefined {
  if (!isAnyOf(column.type, ["option", "multiOption"])) {
    return new Map<string, number>()
  }

  if (strategy === "server") {
    return column.facetedOptions
  }

  const acc = new Map<string, number>()

  if (isColumnOptionArray(values)) {
    for (const option of values) {
      const curr = acc.get(option.value) ?? 0
      acc.set(option.value, curr + 1)
    }
  } else {
    for (const option of values) {
      const curr = acc.get(option as string) ?? 0
      acc.set(option as string, curr + 1)
    }
  }

  return acc
}

export function getFacetedMinMaxValues<
  TData,
  TType extends ColumnDataType,
  TVal,
>(
  column: ColumnConfig<TData, TType, TVal>,
  data: TData[],
  strategy: FilterStrategy,
): [number, number] | undefined {
  if (column.type !== "number") return undefined

  if (typeof column.min === "number" && typeof column.max === "number") {
    return [column.min, column.max]
  }

  if (strategy === "server") {
    return undefined
  }

  const values = data
    .flatMap((row) => column.accessor(row) as Nullable<number>)
    .filter((v): v is number => typeof v === "number" && !Number.isNaN(v))

  if (values.length === 0) {
    return [0, 0]
  }

  return [Math.min(...values), Math.max(...values)]
}

export function createColumns<TData>(
  data: TData[],
  columnConfigs: ReadonlyArray<
    ColumnConfig<TData, ColumnDataType, unknown, string>
  >,
  strategy: FilterStrategy,
): Column<TData>[] {
  return columnConfigs.map((columnConfig) => {
    const getOptions: () => ColumnOption[] = memo(
      () => [data, strategy, columnConfig.options],
      ([d, s]) =>
        getColumnOptions(columnConfig, d as TData[], s as FilterStrategy),
      { key: `options-${columnConfig.id}` },
    )

    const getValues = memo(
      () => [data, strategy],
      () => (strategy === "client" ? getColumnValues(columnConfig, data) : []),
      { key: `values-${columnConfig.id}` },
    )

    const getUniqueValues: () => Map<string, number> | undefined = memo(
      () => [getValues(), strategy],
      ([values, s]) =>
        getFacetedUniqueValues(
          columnConfig,
          values as string[] | ColumnOption[],
          s as FilterStrategy,
        ),
      { key: `faceted-${columnConfig.id}` },
    )

    const getMinMaxValues: () => [number, number] | undefined = memo(
      () => [data, strategy],
      () => getFacetedMinMaxValues(columnConfig, data, strategy),
      { key: `minmax-${columnConfig.id}` },
    )

    const column: Column<TData> = {
      ...columnConfig,
      getOptions,
      getValues: getValues as Column<TData>["getValues"],
      getFacetedUniqueValues: getUniqueValues,
      getFacetedMinMaxValues: getMinMaxValues,
      prefetchOptions: async () => {},
      prefetchValues: async () => {},
      prefetchFacetedUniqueValues: async () => {},
      prefetchFacetedMinMaxValues: async () => {},
      _prefetchedOptionsCache: null,
      _prefetchedValuesCache: null,
      _prefetchedFacetedUniqueValuesCache: null,
      _prefetchedFacetedMinMaxValuesCache: null,
    }

    if (strategy === "client") {
      column.prefetchOptions = async () => {
        if (!column._prefetchedOptionsCache) {
          await new Promise((resolve) =>
            setTimeout(() => {
              column._prefetchedOptionsCache = getOptions()
              resolve(undefined)
            }, 0),
          )
        }
      }

      column.prefetchValues = async () => {
        if (!column._prefetchedValuesCache) {
          await new Promise((resolve) =>
            setTimeout(() => {
              column._prefetchedValuesCache = getValues() as ElementType<
                NonNullable<unknown>
              >[]
              resolve(undefined)
            }, 0),
          )
        }
      }

      column.prefetchFacetedUniqueValues = async () => {
        if (!column._prefetchedFacetedUniqueValuesCache) {
          await new Promise((resolve) =>
            setTimeout(() => {
              column._prefetchedFacetedUniqueValuesCache =
                getUniqueValues() ?? null
              resolve(undefined)
            }, 0),
          )
        }
      }

      column.prefetchFacetedMinMaxValues = async () => {
        if (!column._prefetchedFacetedMinMaxValuesCache) {
          await new Promise((resolve) =>
            setTimeout(() => {
              column._prefetchedFacetedMinMaxValuesCache =
                getMinMaxValues() ?? null
              resolve(undefined)
            }, 0),
          )
        }
      }
    }

    return column
  })
}

/* ----------------------------- operators --------------------------------- */

export const DEFAULT_OPERATORS: Record<
  ColumnDataType,
  Record<FilterOperatorTarget, FilterOperators[ColumnDataType]>
> = {
  text: { single: "contains", multiple: "contains" },
  number: { single: "is", multiple: "is between" },
  date: { single: "is", multiple: "is between" },
  option: { single: "is", multiple: "is any of" },
  multiOption: { single: "include", multiple: "include any of" },
}

export const optionFilterOperators = {
  is: {
    key: "filters.option.is",
    value: "is",
    target: "single",
    singularOf: "is any of",
    relativeOf: "is not",
    isNegated: false,
    negation: "is not",
  },
  "is not": {
    key: "filters.option.isNot",
    value: "is not",
    target: "single",
    singularOf: "is none of",
    relativeOf: "is",
    isNegated: true,
    negationOf: "is",
  },
  "is any of": {
    key: "filters.option.isAnyOf",
    value: "is any of",
    target: "multiple",
    pluralOf: "is",
    relativeOf: "is none of",
    isNegated: false,
    negation: "is none of",
  },
  "is none of": {
    key: "filters.option.isNoneOf",
    value: "is none of",
    target: "multiple",
    pluralOf: "is not",
    relativeOf: "is any of",
    isNegated: true,
    negationOf: "is any of",
  },
} as const satisfies FilterDetails<"option">

export const multiOptionFilterOperators = {
  include: {
    key: "filters.multiOption.include",
    value: "include",
    target: "single",
    singularOf: "include any of",
    relativeOf: "exclude",
    isNegated: false,
    negation: "exclude",
  },
  exclude: {
    key: "filters.multiOption.exclude",
    value: "exclude",
    target: "single",
    singularOf: "exclude if any of",
    relativeOf: "include",
    isNegated: true,
    negationOf: "include",
  },
  "include any of": {
    key: "filters.multiOption.includeAnyOf",
    value: "include any of",
    target: "multiple",
    pluralOf: "include",
    relativeOf: ["exclude if all", "include all of", "exclude if any of"],
    isNegated: false,
    negation: "exclude if all",
  },
  "exclude if all": {
    key: "filters.multiOption.excludeIfAll",
    value: "exclude if all",
    target: "multiple",
    pluralOf: "exclude",
    relativeOf: ["include any of", "include all of", "exclude if any of"],
    isNegated: true,
    negationOf: "include any of",
  },
  "include all of": {
    key: "filters.multiOption.includeAllOf",
    value: "include all of",
    target: "multiple",
    pluralOf: "include",
    relativeOf: ["include any of", "exclude if all", "exclude if any of"],
    isNegated: false,
    negation: "exclude if any of",
  },
  "exclude if any of": {
    key: "filters.multiOption.excludeIfAnyOf",
    value: "exclude if any of",
    target: "multiple",
    pluralOf: "exclude",
    relativeOf: ["include any of", "exclude if all", "include all of"],
    isNegated: true,
    negationOf: "include all of",
  },
} as const satisfies FilterDetails<"multiOption">

export const dateFilterOperators = {
  is: {
    key: "filters.date.is",
    value: "is",
    target: "single",
    singularOf: "is between",
    relativeOf: "is after",
    isNegated: false,
    negation: "is before",
  },
  "is not": {
    key: "filters.date.isNot",
    value: "is not",
    target: "single",
    singularOf: "is not between",
    relativeOf: [
      "is",
      "is before",
      "is on or after",
      "is after",
      "is on or before",
    ],
    isNegated: true,
    negationOf: "is",
  },
  "is before": {
    key: "filters.date.isBefore",
    value: "is before",
    target: "single",
    singularOf: "is between",
    relativeOf: [
      "is",
      "is not",
      "is on or after",
      "is after",
      "is on or before",
    ],
    isNegated: false,
    negation: "is on or after",
  },
  "is on or after": {
    key: "filters.date.isOnOrAfter",
    value: "is on or after",
    target: "single",
    singularOf: "is between",
    relativeOf: ["is", "is not", "is before", "is after", "is on or before"],
    isNegated: false,
    negation: "is before",
  },
  "is after": {
    key: "filters.date.isAfter",
    value: "is after",
    target: "single",
    singularOf: "is between",
    relativeOf: [
      "is",
      "is not",
      "is before",
      "is on or after",
      "is on or before",
    ],
    isNegated: false,
    negation: "is on or before",
  },
  "is on or before": {
    key: "filters.date.isOnOrBefore",
    value: "is on or before",
    target: "single",
    singularOf: "is between",
    relativeOf: ["is", "is not", "is after", "is on or after", "is before"],
    isNegated: false,
    negation: "is after",
  },
  "is between": {
    key: "filters.date.isBetween",
    value: "is between",
    target: "multiple",
    pluralOf: "is",
    relativeOf: "is not between",
    isNegated: false,
    negation: "is not between",
  },
  "is not between": {
    key: "filters.date.isNotBetween",
    value: "is not between",
    target: "multiple",
    pluralOf: "is not",
    relativeOf: "is between",
    isNegated: true,
    negationOf: "is between",
  },
} as const satisfies FilterDetails<"date">

export const textFilterOperators = {
  contains: {
    key: "filters.text.contains",
    value: "contains",
    target: "single",
    relativeOf: "does not contain",
    isNegated: false,
    negation: "does not contain",
  },
  "does not contain": {
    key: "filters.text.doesNotContain",
    value: "does not contain",
    target: "single",
    relativeOf: "contains",
    isNegated: true,
    negationOf: "contains",
  },
} as const satisfies FilterDetails<"text">

export const numberFilterOperators = {
  is: {
    key: "filters.number.is",
    value: "is",
    target: "single",
    singularOf: "is between",
    relativeOf: [
      "is not",
      "is greater than",
      "is less than or equal to",
      "is less than",
      "is greater than or equal to",
    ],
    isNegated: false,
    negation: "is not",
  },
  "is not": {
    key: "filters.number.isNot",
    value: "is not",
    target: "single",
    singularOf: "is not between",
    relativeOf: [
      "is",
      "is greater than",
      "is less than or equal to",
      "is less than",
      "is greater than or equal to",
    ],
    isNegated: true,
    negationOf: "is",
  },
  "is greater than": {
    key: "filters.number.greaterThan",
    value: "is greater than",
    target: "single",
    singularOf: "is between",
    relativeOf: [
      "is",
      "is not",
      "is less than or equal to",
      "is less than",
      "is greater than or equal to",
    ],
    isNegated: false,
    negation: "is less than or equal to",
  },
  "is greater than or equal to": {
    key: "filters.number.greaterThanOrEqual",
    value: "is greater than or equal to",
    target: "single",
    singularOf: "is between",
    relativeOf: [
      "is",
      "is not",
      "is greater than",
      "is less than or equal to",
      "is less than",
    ],
    isNegated: false,
    negation: "is less than or equal to",
  },
  "is less than": {
    key: "filters.number.lessThan",
    value: "is less than",
    target: "single",
    singularOf: "is between",
    relativeOf: [
      "is",
      "is not",
      "is greater than",
      "is less than or equal to",
      "is greater than or equal to",
    ],
    isNegated: false,
    negation: "is greater than",
  },
  "is less than or equal to": {
    key: "filters.number.lessThanOrEqual",
    value: "is less than or equal to",
    target: "single",
    singularOf: "is between",
    relativeOf: [
      "is",
      "is not",
      "is greater than",
      "is less than",
      "is greater than or equal to",
    ],
    isNegated: false,
    negation: "is greater than or equal to",
  },
  "is between": {
    key: "filters.number.isBetween",
    value: "is between",
    target: "multiple",
    pluralOf: "is",
    relativeOf: "is not between",
    isNegated: false,
    negation: "is not between",
  },
  "is not between": {
    key: "filters.number.isNotBetween",
    value: "is not between",
    target: "multiple",
    pluralOf: "is not",
    relativeOf: "is between",
    isNegated: true,
    negationOf: "is between",
  },
} as const satisfies FilterDetails<"number">

export const filterTypeOperatorDetails: FilterTypeOperatorDetails = {
  text: textFilterOperators,
  number: numberFilterOperators,
  date: dateFilterOperators,
  option: optionFilterOperators,
  multiOption: multiOptionFilterOperators,
}

export function determineNewOperator<TType extends ColumnDataType>(
  type: TType,
  oldVals: FilterValues<TType>,
  nextVals: FilterValues<TType>,
  currentOperator: FilterOperators[TType],
): FilterOperators[TType] {
  const a =
    Array.isArray(oldVals) && Array.isArray(oldVals[0])
      ? (oldVals[0] as unknown[]).length
      : oldVals.length
  const b =
    Array.isArray(nextVals) && Array.isArray(nextVals[0])
      ? (nextVals[0] as unknown[]).length
      : nextVals.length

  if (a === b || (a >= 2 && b >= 2) || (a <= 1 && b <= 1))
    return currentOperator

  const opDetails = filterTypeOperatorDetails[type][
    currentOperator as keyof (typeof filterTypeOperatorDetails)[TType]
  ] as {
    singularOf?: FilterOperators[TType]
    pluralOf?: FilterOperators[TType]
  }

  if (a < b && b >= 2) return opDetails.singularOf ?? currentOperator
  if (a > b && b <= 1) return opDetails.pluralOf ?? currentOperator
  return currentOperator
}

/* ----------------------------- filter-fns -------------------------------- */

export function optionFilterFn(
  inputData: string,
  filterValue: FilterModel<"option">,
): boolean {
  if (!inputData) return false
  if (filterValue.values.length === 0) return true

  const value = inputData.toString().toLowerCase()
  const found = !!filterValue.values.find((v) => v.toLowerCase() === value)

  switch (filterValue.operator) {
    case "is":
    case "is any of":
      return found
    case "is not":
    case "is none of":
      return !found
  }
}

export function multiOptionFilterFn(
  inputData: string[],
  filterValue: FilterModel<"multiOption">,
): boolean {
  if (!inputData) return false

  if (
    filterValue.values.length === 0 ||
    !filterValue.values[0] ||
    filterValue.values[0].length === 0
  )
    return true

  const values = inputData
  const filterValues = filterValue.values as unknown as string[]

  switch (filterValue.operator) {
    case "include":
    case "include any of":
      return intersection(values, filterValues).length > 0
    case "exclude":
      return intersection(values, filterValues).length === 0
    case "exclude if any of":
      return !(intersection(values, filterValues).length > 0)
    case "include all of":
      return intersection(values, filterValues).length === filterValues.length
    case "exclude if all":
      return !(
        intersection(values, filterValues).length === filterValues.length
      )
  }
}

export function dateFilterFn(
  inputData: Date,
  filterValue: FilterModel<"date">,
): boolean {
  if (!filterValue || filterValue.values.length === 0) return true

  if (
    dateFilterOperators[filterValue.operator].target === "single" &&
    filterValue.values.length > 1
  )
    throw new Error("Singular operators require at most one filter value")

  const d1 = filterValue.values[0]!
  const d2 = filterValue.values[1]

  const value = inputData

  switch (filterValue.operator) {
    case "is":
      return isSameDay(value, d1)
    case "is not":
      return !isSameDay(value, d1)
    case "is before":
      return isBefore(value, startOfDay(d1))
    case "is on or after":
      return isSameDay(value, d1) || isAfter(value, startOfDay(d1))
    case "is after":
      return isAfter(value, startOfDay(d1))
    case "is on or before":
      return isSameDay(value, d1) || isBefore(value, startOfDay(d1))
    case "is between":
      return isWithinInterval(value, {
        start: startOfDay(d1),
        end: endOfDay(d2!),
      })
    case "is not between":
      return !isWithinInterval(value, {
        start: startOfDay(d1),
        end: endOfDay(d2!),
      })
  }
}

export function textFilterFn(
  inputData: string,
  filterValue: FilterModel<"text">,
): boolean {
  if (!filterValue || filterValue.values.length === 0) return true

  const value = inputData.toLowerCase().trim()
  const filterStr = filterValue.values[0]!.toLowerCase().trim()

  if (filterStr === "") return true

  const found = value.includes(filterStr)

  switch (filterValue.operator) {
    case "contains":
      return found
    case "does not contain":
      return !found
  }
}

export function numberFilterFn(
  inputData: number,
  filterValue: FilterModel<"number">,
): boolean {
  if (!filterValue || !filterValue.values || filterValue.values.length === 0) {
    return true
  }

  const value = inputData
  const filterVal = filterValue.values[0]!

  switch (filterValue.operator) {
    case "is":
      return value === filterVal
    case "is not":
      return value !== filterVal
    case "is greater than":
      return value > filterVal
    case "is greater than or equal to":
      return value >= filterVal
    case "is less than":
      return value < filterVal
    case "is less than or equal to":
      return value <= filterVal
    case "is between": {
      const lowerBound = filterValue.values[0]!
      const upperBound = filterValue.values[1]!
      return value >= lowerBound && value <= upperBound
    }
    case "is not between": {
      const lowerBound = filterValue.values[0]!
      const upperBound = filterValue.values[1]!
      return value < lowerBound || value > upperBound
    }
    default:
      return true
  }
}
