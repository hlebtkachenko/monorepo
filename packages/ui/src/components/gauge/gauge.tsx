"use client"

import * as React from "react"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

const GAUGE_NAME = "Gauge"
const INDICATOR_NAME = "GaugeIndicator"
const TRACK_NAME = "GaugeTrack"
const RANGE_NAME = "GaugeRange"
const VALUE_TEXT_NAME = "GaugeValueText"
const LABEL_NAME = "GaugeLabel"

const DEFAULT_MAX = 100
const DEFAULT_START_ANGLE = 0
const DEFAULT_END_ANGLE = 360

type GaugeState = "indeterminate" | "complete" | "loading"

interface DivProps extends React.ComponentProps<"div"> {
  asChild?: boolean
}

function isValidNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value)
}

function isValidMaxNumber(max: unknown): max is number {
  return isValidNumber(max) && max > 0
}

function isValidValueNumber(
  value: unknown,
  min: number,
  max: number,
): value is number {
  return isValidNumber(value) && value <= max && value >= min
}

function getGaugeState(
  value: number | undefined | null,
  maxValue: number,
): GaugeState {
  return value == null
    ? "indeterminate"
    : value === maxValue
      ? "complete"
      : "loading"
}

function getDefaultValueText(value: number, min: number, max: number): string {
  const percentage = max === min ? 100 : ((value - min) / (max - min)) * 100
  return Math.round(percentage).toString()
}

function normalizeAngle(angle: number) {
  return ((angle % 360) + 360) % 360
}

function polarToCartesian(
  centerX: number,
  centerY: number,
  radius: number,
  angleInDegrees: number,
) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians),
  }
}

function describeArc(
  x: number,
  y: number,
  radius: number,
  startAngle: number,
  endAngle: number,
): string {
  const angleDiff = endAngle - startAngle
  if (Math.abs(angleDiff) >= 360) {
    const start = polarToCartesian(x, y, radius, startAngle)
    const mid = polarToCartesian(x, y, radius, startAngle + 180)
    return [
      "M",
      start.x,
      start.y,
      "A",
      radius,
      radius,
      0,
      0,
      1,
      mid.x,
      mid.y,
      "A",
      radius,
      radius,
      0,
      0,
      1,
      start.x,
      start.y,
    ].join(" ")
  }
  const start = polarToCartesian(x, y, radius, startAngle)
  const end = polarToCartesian(x, y, radius, endAngle)
  const largeArcFlag = angleDiff <= 180 ? "0" : "1"
  return [
    "M",
    start.x,
    start.y,
    "A",
    radius,
    radius,
    0,
    largeArcFlag,
    1,
    end.x,
    end.y,
  ].join(" ")
}

interface GaugeContextValue {
  value: number | null
  valueText: string | undefined
  max: number
  min: number
  state: GaugeState
  radius: number
  thickness: number
  size: number
  center: number
  percentage: number | null
  startAngle: number
  endAngle: number
  arcLength: number
  arcCenterY: number
  valueTextId: string
  labelId: string
}

const GaugeContext = React.createContext<GaugeContextValue | null>(null)

function useGaugeContext(consumerName: string) {
  const ctx = React.useContext(GaugeContext)
  if (!ctx) {
    throw new Error(`\`${consumerName}\` must be used within \`${GAUGE_NAME}\``)
  }
  return ctx
}

interface GaugeProps extends DivProps {
  value?: number | null | undefined
  getValueText?(value: number, min: number, max: number): string
  min?: number
  max?: number
  size?: number
  thickness?: number
  startAngle?: number
  endAngle?: number
}

function Gauge({
  value: valueProp = null,
  getValueText = getDefaultValueText,
  min: minProp = 0,
  max: maxProp,
  size = 120,
  thickness = 8,
  startAngle = DEFAULT_START_ANGLE,
  endAngle = DEFAULT_END_ANGLE,
  asChild,
  className,
  ...rootProps
}: GaugeProps) {
  const rawMax = isValidMaxNumber(maxProp) ? maxProp : DEFAULT_MAX
  const min = isValidNumber(minProp) ? minProp : 0
  const max = rawMax <= min ? min + 1 : rawMax

  const value = isValidValueNumber(valueProp, min, max)
    ? valueProp
    : isValidNumber(valueProp) && valueProp > max
      ? max
      : isValidNumber(valueProp) && valueProp < min
        ? min
        : null

  const valueText = isValidNumber(value)
    ? getValueText(value, min, max)
    : undefined
  const state = getGaugeState(value, max)
  const radius = Math.max(0, (size - thickness) / 2)
  const center = size / 2
  const angleDiff = Math.abs(endAngle - startAngle)
  const arcLength = (Math.min(angleDiff, 360) / 360) * (2 * Math.PI * radius)

  const percentage = isValidNumber(value)
    ? max === min
      ? 1
      : (value - min) / (max - min)
    : null

  const isFullCircle = angleDiff >= 360
  let arcCenterY = center
  if (!isFullCircle) {
    const startRad = (startAngle * Math.PI) / 180
    const endRad = (endAngle * Math.PI) / 180
    const startY = center - radius * Math.cos(startRad)
    const endY = center - radius * Math.cos(endRad)
    let minY = Math.min(startY, endY)
    let maxY = Math.max(startY, endY)
    const normStart = normalizeAngle(startAngle)
    const normEnd = normalizeAngle(endAngle)
    const includesTop =
      normStart > normEnd
        ? normStart <= 270 || normEnd >= 270
        : normStart <= 270 && normEnd >= 270
    const includesBottom =
      normStart > normEnd
        ? normStart <= 90 || normEnd >= 90
        : normStart <= 90 && normEnd >= 90
    if (includesTop) minY = Math.min(minY, center - radius)
    if (includesBottom) maxY = Math.max(maxY, center + radius)
    arcCenterY = (minY + maxY) / 2
  }

  const labelId = React.useId()
  const valueTextId = React.useId()

  const contextValue = React.useMemo<GaugeContextValue>(
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
      percentage,
      startAngle,
      endAngle,
      arcLength,
      arcCenterY,
      valueTextId,
      labelId,
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
      percentage,
      startAngle,
      endAngle,
      arcLength,
      arcCenterY,
      valueTextId,
      labelId,
    ],
  )

  const Comp = asChild ? Slot.Root : "div"

  return (
    <GaugeContext.Provider value={contextValue}>
      <Comp
        role="meter"
        aria-describedby={valueText ? valueTextId : undefined}
        aria-labelledby={labelId}
        aria-valuemax={max}
        aria-valuemin={min}
        aria-valuenow={isValidNumber(value) ? value : undefined}
        aria-valuetext={valueText}
        data-slot="gauge"
        data-state={state}
        data-value={value ?? undefined}
        data-max={max}
        data-min={min}
        data-percentage={percentage}
        {...rootProps}
        className={cn(
          "relative inline-flex w-fit flex-col items-center justify-center",
          className,
        )}
      />
    </GaugeContext.Provider>
  )
}

function GaugeIndicator({ className, ...props }: React.ComponentProps<"svg">) {
  const { size, state, value, max, min, percentage } =
    useGaugeContext(INDICATOR_NAME)
  return (
    <svg
      aria-hidden="true"
      focusable="false"
      viewBox={`0 0 ${size} ${size}`}
      data-slot="gauge-indicator"
      data-state={state}
      data-value={value ?? undefined}
      data-max={max}
      data-min={min}
      data-percentage={percentage}
      width={size}
      height={size}
      {...props}
      className={cn("transform", className)}
    />
  )
}

function GaugeTrack({ className, ...props }: React.ComponentProps<"path">) {
  const { center, radius, startAngle, endAngle, thickness, state } =
    useGaugeContext(TRACK_NAME)
  const pathData = describeArc(center, center, radius, startAngle, endAngle)
  return (
    <path
      data-slot="gauge-track"
      data-state={state}
      d={pathData}
      fill="none"
      stroke="currentColor"
      strokeWidth={thickness}
      strokeLinecap="round"
      vectorEffect="non-scaling-stroke"
      {...props}
      className={cn("text-muted-foreground/20", className)}
    />
  )
}

function GaugeRange({ className, ...props }: React.ComponentProps<"path">) {
  const {
    center,
    radius,
    startAngle,
    endAngle,
    value,
    max,
    min,
    state,
    thickness,
    arcLength,
    percentage,
  } = useGaugeContext(RANGE_NAME)

  const pathData = describeArc(center, center, radius, startAngle, endAngle)
  const strokeDasharray = arcLength
  const strokeDashoffset =
    state === "indeterminate"
      ? 0
      : percentage !== null
        ? arcLength - percentage * arcLength
        : arcLength

  return (
    <path
      data-slot="gauge-range"
      data-state={state}
      data-value={value ?? undefined}
      data-max={max}
      data-min={min}
      d={pathData}
      fill="none"
      stroke="currentColor"
      strokeWidth={thickness}
      strokeLinecap="round"
      strokeDasharray={strokeDasharray}
      strokeDashoffset={strokeDashoffset}
      vectorEffect="non-scaling-stroke"
      {...props}
      className={cn(
        "text-primary transition-[stroke-dashoffset] duration-700 ease-out",
        className,
      )}
    />
  )
}

function GaugeValueText({
  asChild,
  className,
  children,
  style,
  ...props
}: DivProps) {
  const { valueTextId, state, arcCenterY, valueText } =
    useGaugeContext(VALUE_TEXT_NAME)
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      id={valueTextId}
      data-slot="gauge-value-text"
      data-state={state}
      {...props}
      style={{ top: `${arcCenterY}px`, ...style }}
      className={cn(
        "absolute right-0 left-0 flex -translate-y-1/2 items-center justify-center text-2xl font-semibold",
        className,
      )}
    >
      {children ?? valueText}
    </Comp>
  )
}

function GaugeLabel({ asChild, className, ...props }: DivProps) {
  const { labelId, state } = useGaugeContext(LABEL_NAME)
  const Comp = asChild ? Slot.Root : "div"
  return (
    <Comp
      id={labelId}
      data-slot="gauge-label"
      data-state={state}
      {...props}
      className={cn(
        "mt-2 text-sm font-medium text-muted-foreground",
        className,
      )}
    />
  )
}

export {
  Gauge,
  GaugeIndicator,
  GaugeLabel,
  GaugeRange,
  GaugeTrack,
  GaugeValueText,
}
export type { GaugeProps }
