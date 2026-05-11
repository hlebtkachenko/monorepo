"use client"

import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

const ROOT_NAME = "CircularProgress"
const INDICATOR_NAME = "CircularProgressIndicator"
const TRACK_NAME = "CircularProgressTrack"
const RANGE_NAME = "CircularProgressRange"
const VALUE_TEXT_NAME = "CircularProgressValueText"

const DEFAULT_MAX = 100

type ProgressState = "indeterminate" | "complete" | "loading"

function progressState(
  value: number | undefined | null,
  maxValue: number,
): ProgressState {
  return value == null
    ? "indeterminate"
    : value === maxValue
      ? "complete"
      : "loading"
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isValidMax(max: unknown): max is number {
  return isValidNumber(max) && max > 0
}

function isValidValue(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return isValidNumber(value) && value <= max && value >= min
}

function defaultValueText(value: number, min: number, max: number): string {
  const percentage = max === min ? 100 : ((value - min) / (max - min)) * 100
  return `${Math.round(percentage)}%`
}

interface ContextValue {
  value: number | null
  valueText: string | undefined
  max: number
  min: number
  state: ProgressState
  radius: number
  thickness: number
  size: number
  center: number
  circumference: number
  percentage: number | null
  valueTextId: string
}

const Context = React.createContext<ContextValue | null>(null)

function useCtx(consumer: string) {
  const ctx = React.useContext(Context)
  if (!ctx) {
    throw new Error(`\`${consumer}\` must be used within \`${ROOT_NAME}\``)
  }
  return ctx
}

interface CircularProgressProps extends React.ComponentProps<"div"> {
  value?: number | null | undefined
  getValueText?(value: number, min: number, max: number): string
  min?: number
  max?: number
  size?: number
  thickness?: number
  label?: string
  asChild?: boolean
}

function CircularProgress({
  value: valueProp = null,
  getValueText = defaultValueText,
  min: minProp = 0,
  max: maxProp,
  size = 48,
  thickness = 4,
  label,
  asChild,
  className,
  children,
  ...rootProps
}: CircularProgressProps) {
  const rawMax = isValidMax(maxProp) ? maxProp : DEFAULT_MAX
  const min = isValidNumber(minProp) ? minProp : 0
  const max = rawMax <= min ? min + 1 : rawMax

  const value = isValidValue(valueProp, min, max)
    ? valueProp
    : isValidNumber(valueProp) && valueProp > max
      ? max
      : isValidNumber(valueProp) && valueProp < min
        ? min
        : null

  const valueText = isValidNumber(value)
    ? getValueText(value, min, max)
    : undefined
  const state = progressState(value, max)
  const radius = Math.max(0, (size - thickness) / 2)
  const center = size / 2
  const circumference = 2 * Math.PI * radius

  const percentage = isValidNumber(value)
    ? max === min
      ? 1
      : (value - min) / (max - min)
    : null

  const labelId = React.useId()
  const valueTextId = React.useId()

  const ctxValue = React.useMemo<ContextValue>(
    () => ({
      value,
      valueText,
      max,
      min,
      state,
      radius,
      thickness,
      size,
      center,
      circumference,
      percentage,
      valueTextId,
    }),
    [
      value,
      valueText,
      max,
      min,
      state,
      radius,
      thickness,
      size,
      center,
      circumference,
      percentage,
      valueTextId,
    ],
  )

  const Comp = asChild ? Slot.Root : "div"

  return (
    <Context.Provider value={ctxValue}>
      <Comp
        role="progressbar"
        aria-describedby={valueText ? valueTextId : undefined}
        aria-labelledby={label ? labelId : undefined}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={isValidNumber(value) ? value : undefined}
        aria-valuetext={valueText}
        data-slot="circular-progress"
        data-state={state}
        data-value={value ?? undefined}
        data-max={max}
        data-min={min}
        data-percentage={percentage}
        {...rootProps}
        className={cn(
          "relative inline-flex w-fit items-center justify-center",
          className,
        )}
      >
        {children}
        {label && <div id={labelId}>{label}</div>}
      </Comp>
    </Context.Provider>
  )
}

function CircularProgressIndicator({
  className,
  ...props
}: React.ComponentProps<"svg">) {
  const ctx = useCtx(INDICATOR_NAME)
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${ctx.size} ${ctx.size}`}
      data-slot="circular-progress-indicator"
      data-state={ctx.state}
      data-value={ctx.value ?? undefined}
      data-max={ctx.max}
      data-min={ctx.min}
      data-percentage={ctx.percentage}
      width={ctx.size}
      height={ctx.size}
      {...props}
      className={cn("-rotate-90 transform", className)}
    />
  )
}

function CircularProgressTrack({
  className,
  ...props
}: React.ComponentProps<"circle">) {
  const ctx = useCtx(TRACK_NAME)
  return (
    <circle
      data-slot="circular-progress-track"
      data-state={ctx.state}
      cx={ctx.center}
      cy={ctx.center}
      r={ctx.radius}
      fill="none"
      stroke="currentColor"
      strokeWidth={ctx.thickness}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      {...props}
      className={cn("text-muted-foreground/20", className)}
    />
  )
}

function CircularProgressRange({
  className,
  ...props
}: React.ComponentProps<"circle">) {
  const ctx = useCtx(RANGE_NAME)
  const strokeDasharray = ctx.circumference
  const strokeDashoffset =
    ctx.state === "indeterminate"
      ? ctx.circumference * 0.75
      : ctx.percentage !== null
        ? ctx.circumference - ctx.percentage * ctx.circumference
        : ctx.circumference

  return (
    <circle
      data-slot="circular-progress-range"
      data-state={ctx.state}
      data-value={ctx.value ?? undefined}
      data-max={ctx.max}
      data-min={ctx.min}
      cx={ctx.center}
      cy={ctx.center}
      r={ctx.radius}
      fill="none"
      stroke="currentColor"
      strokeWidth={ctx.thickness}
      strokeLinecap="round"
      strokeDasharray={strokeDasharray}
      strokeDashoffset={strokeDashoffset}
      vectorEffect="non-scaling-stroke"
      {...props}
      className={cn(
        "origin-center text-primary transition-all duration-300 ease-in-out",
        ctx.state === "indeterminate" &&
          "motion-safe:animate-spin-around motion-reduce:animate-none",
        className,
      )}
    />
  )
}

interface CircularProgressValueTextProps extends React.ComponentProps<"span"> {
  asChild?: boolean
}

function CircularProgressValueText({
  asChild,
  className,
  children,
  ...props
}: CircularProgressValueTextProps) {
  const ctx = useCtx(VALUE_TEXT_NAME)
  const Comp = asChild ? Slot.Root : "span"
  return (
    <Comp
      id={ctx.valueTextId}
      data-slot="circular-progress-value-text"
      data-state={ctx.state}
      {...props}
      className={cn(
        "absolute inset-0 flex items-center justify-center text-sm font-medium",
        className,
      )}
    >
      {children ?? ctx.valueText}
    </Comp>
  )
}

export {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
  CircularProgressValueText,
}
export type { CircularProgressProps }
