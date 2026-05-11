"use client"

import * as React from "react"
import {
  createColumns,
  DEFAULT_OPERATORS,
  determineNewOperator,
} from "./filter-bar-core"
import {
  addUniq,
  createDateFilterValue,
  createNumberFilterValue,
  isColumnOptionArray,
  isColumnOptionMap,
  isMinMaxTuple,
  removeUniq,
  uniq,
} from "./filter-bar-helpers"
import type {
  ColumnConfig,
  ColumnDataType,
  ColumnOption,
  DataTableFilterActions,
  FilterModel,
  FilterStrategy,
  FiltersState,
  NumberColumnIds,
  OptionBasedColumnDataType,
  OptionColumnIds,
} from "./filter-bar-types"

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface UseFilterBarOptions<
  TData,
  TColumns extends ReadonlyArray<ColumnConfig<TData, any, any, any>>,
  TStrategy extends FilterStrategy,
> {
  strategy: TStrategy
  data: TData[]
  columnsConfig: TColumns
  defaultFilters?: FiltersState
  filters?: FiltersState
  onFiltersChange?: React.Dispatch<React.SetStateAction<FiltersState>>
  options?: Partial<
    Record<OptionColumnIds<TColumns>, ColumnOption[] | undefined>
  >
  faceted?: Partial<
    | Record<OptionColumnIds<TColumns>, Map<string, number> | undefined>
    | Record<NumberColumnIds<TColumns>, [number, number] | undefined>
  >
}

export function useFilterBar<
  TData,
  TColumns extends ReadonlyArray<ColumnConfig<TData, any, any, any>>,
  TStrategy extends FilterStrategy,
>({
  strategy,
  data,
  columnsConfig,
  defaultFilters,
  filters: externalFilters,
  onFiltersChange,
  options,
  faceted,
}: UseFilterBarOptions<TData, TColumns, TStrategy>) {
  const [internalFilters, setInternalFilters] = React.useState<FiltersState>(
    defaultFilters ?? [],
  )

  if (
    (externalFilters && !onFiltersChange) ||
    (!externalFilters && onFiltersChange)
  ) {
    throw new Error(
      "If using controlled state, you must specify both filters and onFiltersChange.",
    )
  }

  const filters = externalFilters ?? internalFilters
  const setFilters = onFiltersChange ?? setInternalFilters

  const columns = React.useMemo(() => {
    const enhancedConfigs = columnsConfig.map((config) => {
      let final = config

      if (
        options &&
        (config.type === "option" || config.type === "multiOption")
      ) {
        const optionsInput = options[config.id as OptionColumnIds<TColumns>]
        if (optionsInput && isColumnOptionArray(optionsInput)) {
          final = { ...final, options: optionsInput }
        }
      }

      if (
        faceted &&
        (config.type === "option" || config.type === "multiOption")
      ) {
        const facetedOptionsInput = (
          faceted as Record<string, Map<string, number> | undefined>
        )[config.id as string]
        if (facetedOptionsInput && isColumnOptionMap(facetedOptionsInput)) {
          final = { ...final, facetedOptions: facetedOptionsInput }
        }
      }

      if (config.type === "number" && faceted) {
        const minMaxTuple = (
          faceted as Record<string, [number, number] | undefined>
        )[config.id as string]
        if (minMaxTuple && isMinMaxTuple(minMaxTuple)) {
          final = {
            ...final,
            min: minMaxTuple[0],
            max: minMaxTuple[1],
          }
        }
      }

      return final
    })

    return createColumns(data, enhancedConfigs, strategy)
  }, [data, columnsConfig, options, faceted, strategy])

  const actions: DataTableFilterActions = React.useMemo(
    () => ({
      addFilterValue<TInnerData, TType extends OptionBasedColumnDataType>(
        column: ColumnConfig<TInnerData, TType>,
        values: FilterModel<TType>["values"],
      ) {
        if (column.type !== "option" && column.type !== "multiOption") {
          throw new Error(
            "[filter-bar] addFilterValue() is only supported for option columns",
          )
        }
        setFilters((prev) => {
          const filter = prev.find((f) => f.columnId === column.id)
          const isColumnFiltered = filter && filter.values.length > 0
          if (!isColumnFiltered) {
            return [
              ...prev,
              {
                columnId: column.id,
                type: column.type,
                operator:
                  values.length > 1
                    ? DEFAULT_OPERATORS[column.type].multiple
                    : DEFAULT_OPERATORS[column.type].single,
                values,
              } as FilterModel,
            ]
          }
          const oldValues = filter.values
          const newValues = addUniq(
            filter.values as unknown[],
            values as unknown[],
          )
          const newOperator = determineNewOperator(
            column.type,
            oldValues,
            newValues as FilterModel<typeof column.type>["values"],
            filter.operator,
          )
          if (newValues.length === 0) {
            return prev.filter((f) => f.columnId !== column.id)
          }
          return prev.map((f) =>
            f.columnId === column.id
              ? ({
                  columnId: column.id,
                  type: column.type,
                  operator: newOperator,
                  values: newValues,
                } as FilterModel)
              : f,
          )
        })
      },

      removeFilterValue<TInnerData, TType extends OptionBasedColumnDataType>(
        column: ColumnConfig<TInnerData, TType>,
        value: FilterModel<TType>["values"],
      ) {
        if (column.type !== "option" && column.type !== "multiOption") {
          throw new Error(
            "[filter-bar] removeFilterValue() is only supported for option columns",
          )
        }
        setFilters((prev) => {
          const filter = prev.find((f) => f.columnId === column.id)
          const isColumnFiltered = filter && filter.values.length > 0
          if (!isColumnFiltered) return [...prev]
          const newValues = removeUniq(
            filter.values as unknown[],
            value as unknown[],
          )
          const oldValues = filter.values
          const newOperator = determineNewOperator(
            column.type,
            oldValues,
            newValues as FilterModel<typeof column.type>["values"],
            filter.operator,
          )
          if (newValues.length === 0) {
            return prev.filter((f) => f.columnId !== column.id)
          }
          return prev.map((f) =>
            f.columnId === column.id
              ? ({
                  columnId: column.id,
                  type: column.type,
                  operator: newOperator,
                  values: newValues,
                } as FilterModel)
              : f,
          )
        })
      },

      setFilterValue<TInnerData, TType extends ColumnDataType>(
        column: ColumnConfig<TInnerData, TType>,
        values: FilterModel<TType>["values"],
      ) {
        setFilters((prev) => {
          const filter = prev.find((f) => f.columnId === column.id)
          const isColumnFiltered = filter && filter.values.length > 0
          const newValues =
            column.type === "number"
              ? createNumberFilterValue(values as number[])
              : column.type === "date"
                ? createDateFilterValue(
                    values as [Date, Date] | [Date] | [] | undefined,
                  )
                : uniq(values as unknown[])
          if (newValues.length === 0) return prev
          if (!isColumnFiltered) {
            return [
              ...prev,
              {
                columnId: column.id,
                type: column.type,
                operator:
                  values.length > 1
                    ? DEFAULT_OPERATORS[column.type].multiple
                    : DEFAULT_OPERATORS[column.type].single,
                values: newValues,
              } as FilterModel,
            ]
          }
          const oldValues = filter.values
          const newOperator = determineNewOperator(
            column.type,
            oldValues,
            newValues as FilterModel<typeof column.type>["values"],
            filter.operator,
          )
          const newFilter: FilterModel = {
            columnId: column.id,
            type: column.type,
            operator: newOperator,
            values: newValues as FilterModel["values"],
          }
          return prev.map((f) => (f.columnId === column.id ? newFilter : f))
        })
      },

      setFilterOperator<TType extends ColumnDataType>(
        columnId: string,
        operator: FilterModel<TType>["operator"],
      ) {
        setFilters((prev) =>
          prev.map((f) =>
            f.columnId === columnId ? ({ ...f, operator } as FilterModel) : f,
          ),
        )
      },

      removeFilter(columnId: string) {
        setFilters((prev) => prev.filter((f) => f.columnId !== columnId))
      },

      removeAllFilters() {
        setFilters([])
      },
    }),
    [setFilters],
  )

  return { columns, filters, actions, strategy }
}
