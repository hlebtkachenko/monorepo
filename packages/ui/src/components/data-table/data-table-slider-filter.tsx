"use client"

import type { Column } from "@tanstack/react-table"
import { PlusCircle, XCircle } from "@workspace/ui/lib/icons"
import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"
import { formatNumber, parseNumber } from "@workspace/ui/lib/format-number"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import { Slider } from "@workspace/ui/components/slider"

type RangeValue = [number, number]

function getIsValidRange(value: unknown): value is RangeValue {
  return (
    Array.isArray(value) &&
    value.length === 2 &&
    typeof value[0] === "number" &&
    typeof value[1] === "number"
  )
}

function parseValuesAsNumbers(value: unknown): RangeValue | undefined {
  if (
    Array.isArray(value) &&
    value.length === 2 &&
    value.every(
      (v) =>
        (typeof v === "string" || typeof v === "number") && !Number.isNaN(v),
    )
  ) {
    return [Number(value[0]), Number(value[1])]
  }
  return undefined
}

interface DataTableSliderFilterProps<TData> {
  column: Column<TData, unknown>
  title?: string
}

export function DataTableSliderFilter<TData>({
  column,
  title,
}: DataTableSliderFilterProps<TData>) {
  const id = React.useId()
  const columnFilterValue = parseValuesAsNumbers(column.getFilterValue())

  const defaultRange = column.columnDef.meta?.range
  const unit = column.columnDef.meta?.unit

  const { min, max, step } = React.useMemo(() => {
    let minValue = 0
    let maxValue = 100

    if (defaultRange && getIsValidRange(defaultRange)) {
      ;[minValue, maxValue] = defaultRange
    } else {
      const values = column.getFacetedMinMaxValues()
      if (values && Array.isArray(values) && values.length === 2) {
        const [a, b] = values
        if (typeof a === "number" && typeof b === "number") {
          minValue = a
          maxValue = b
        }
      }
    }
    const rangeSize = maxValue - minValue
    const stepSize =
      rangeSize <= 20
        ? 1
        : rangeSize <= 100
          ? Math.ceil(rangeSize / 20)
          : Math.ceil(rangeSize / 50)
    return { min: minValue, max: maxValue, step: stepSize }
  }, [column, defaultRange])

  const range = React.useMemo<RangeValue>(
    () => columnFilterValue ?? [min, max],
    [columnFilterValue, min, max],
  )

  const formatValue = React.useCallback(
    (value: number) => formatNumber(value, { maximumFractionDigits: 0 }),
    [],
  )

  const onFromChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const num = parseNumber(event.target.value)
      if (num !== null && num >= min && num <= range[1]) {
        column.setFilterValue([num, range[1]])
      }
    },
    [column, min, range],
  )

  const onToChange = React.useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const num = parseNumber(event.target.value)
      if (num !== null && num <= max && num >= range[0]) {
        column.setFilterValue([range[0], num])
      }
    },
    [column, max, range],
  )

  const onSliderChange = React.useCallback(
    (value: number[]) => {
      if (Array.isArray(value) && value.length === 2) {
        column.setFilterValue([value[0], value[1]] as RangeValue)
      }
    },
    [column],
  )

  const onReset = React.useCallback(
    (event: React.MouseEvent) => {
      if (event.target instanceof HTMLDivElement) {
        event.stopPropagation()
      }
      column.setFilterValue(undefined)
    },
    [column],
  )

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          data-slot="data-table-slider-filter-trigger"
          variant="outline"
          size="sm"
          className="border-dashed font-normal"
        >
          {columnFilterValue ? (
            <div
              role="button"
              aria-label={`Clear ${title} filter`}
              tabIndex={0}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              onClick={onReset}
            >
              <XCircle />
            </div>
          ) : (
            <PlusCircle />
          )}
          <span>{title}</span>
          {columnFilterValue ? (
            <>
              <Separator
                orientation="vertical"
                className="mx-0.5 data-vertical:h-4"
              />
              {formatValue(columnFilterValue[0])} -{" "}
              {formatValue(columnFilterValue[1])}
              {unit ? ` ${unit}` : ""}
            </>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-slot="data-table-slider-filter"
        align="start"
        className="flex w-auto flex-col gap-4"
      >
        <div className="flex flex-col gap-3">
          <p className="leading-none font-medium">{title}</p>
          <div className="flex items-center gap-4">
            <Label htmlFor={`${id}-from`} className="sr-only">
              From
            </Label>
            <div className="relative">
              <Input
                id={`${id}-from`}
                type="text"
                aria-valuemin={min}
                aria-valuemax={max}
                inputMode="decimal"
                placeholder={formatValue(min)}
                value={formatValue(range[0] ?? min)}
                onChange={onFromChange}
                className={cn("h-8 min-w-[8rem]", unit && "pr-8")}
              />
              {unit && (
                <span className="absolute top-0 right-0 bottom-0 flex items-center rounded-r-md bg-accent px-2 text-sm text-muted-foreground">
                  {unit}
                </span>
              )}
            </div>
            <Label htmlFor={`${id}-to`} className="sr-only">
              To
            </Label>
            <div className="relative">
              <Input
                id={`${id}-to`}
                type="text"
                aria-valuemin={min}
                aria-valuemax={max}
                inputMode="decimal"
                placeholder={formatValue(max)}
                value={formatValue(range[1] ?? max)}
                onChange={onToChange}
                className={cn("h-8 min-w-[8rem]", unit && "pr-8")}
              />
              {unit && (
                <span className="absolute top-0 right-0 bottom-0 flex items-center rounded-r-md bg-accent px-2 text-sm text-muted-foreground">
                  {unit}
                </span>
              )}
            </div>
          </div>
          <Label htmlFor={`${id}-slider`} className="sr-only">
            {title} slider
          </Label>
          <Slider
            id={`${id}-slider`}
            min={min}
            max={max}
            step={step}
            value={range}
            onValueChange={onSliderChange}
          />
        </div>
        <Button
          aria-label={`Clear ${title} filter`}
          variant="outline"
          size="sm"
          onClick={onReset}
        >
          Clear
        </Button>
      </PopoverContent>
    </Popover>
  )
}
