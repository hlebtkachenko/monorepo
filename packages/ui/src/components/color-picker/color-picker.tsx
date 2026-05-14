"use client"

import * as React from "react"
import { CheckIcon, ChevronDownIcon } from "@workspace/ui/lib/icons"

import { cn } from "@workspace/ui/lib/utils"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

// ─── color math ───────────────────────────────────────────────────────────────

function hexToHsl(hex: string): [number, number, number] {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex)
  if (!result) return [0, 0, 0]

  const r = parseInt(result[1] ?? "0", 16) / 255
  const g = parseInt(result[2] ?? "0", 16) / 255
  const b = parseInt(result[3] ?? "0", 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  let h = 0
  let s = 0
  const l = (max + min) / 2

  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0)
        break
      case g:
        h = (b - r) / d + 2
        break
      case b:
        h = (r - g) / d + 4
        break
    }
    h /= 6
  }

  return [Math.round(h * 360), Math.round(s * 100), Math.round(l * 100)]
}

function normalizeColor(color: string): string {
  if (color.startsWith("#")) {
    return color.toUpperCase()
  }
  if (color.startsWith("hsl")) {
    const matches = color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0]
    const h = matches[0] ?? 0
    const s = matches[1] ?? 0
    const l = matches[2] ?? 0
    return `hsl(${Math.round(h)}, ${Math.round(s)}%, ${Math.round(l)}%)`
  }
  return color
}

function trimColorString(color: string, maxLength = 20): string {
  if (color.length <= maxLength) return color
  return `${color.slice(0, maxLength - 3)}...`
}

const HEX_RE = /^#[0-9A-Fa-f]{6}$/
const HSL_RE =
  /^hsl\(\s*\d+(\.\d+)?\s*,\s*\d+(\.\d+)?%\s*,\s*\d+(\.\d+)?%\s*\)$/

const COLOR_PRESETS = [
  "#FF3B30",
  "#FF9500",
  "#FFCC00",
  "#4CD964",
  "#5AC8FA",
  "#007AFF",
  "#5856D6",
  "#FF2D55",
  "#8E8E93",
  "#EFEFF4",
  "#E5E5EA",
  "#D1D1D6",
]

// ─── component ────────────────────────────────────────────────────────────────

export interface ColorPickerProps {
  color: string
  onChange: (color: string) => void
  className?: string
  presets?: string[]
}

function ColorPicker({
  color,
  onChange,
  className,
  presets = COLOR_PRESETS,
}: ColorPickerProps) {
  const [hsl, setHsl] = React.useState<[number, number, number]>(() =>
    color.startsWith("#") ? hexToHsl(color) : [0, 0, 0],
  )
  const [colorInput, setColorInput] = React.useState(() =>
    normalizeColor(color),
  )

  const applyColor = React.useCallback(
    (next: string) => {
      const normalized = normalizeColor(next)
      setColorInput(normalized)

      const parsed: [number, number, number] = normalized.startsWith("#")
        ? hexToHsl(normalized)
        : (() => {
            const m = normalized.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0]
            return [m[0] ?? 0, m[1] ?? 0, m[2] ?? 0]
          })()

      setHsl(parsed)
      onChange(
        `hsl(${parsed[0].toFixed(1)}, ${parsed[1].toFixed(1)}%, ${parsed[2].toFixed(1)}%)`,
      )
    },
    [onChange],
  )

  // Sync when the external `color` prop changes.
  React.useEffect(() => {
    const normalized = normalizeColor(color)
    setColorInput((prev) => (prev === normalized ? prev : normalized))
    if (normalized.startsWith("#")) {
      setHsl(hexToHsl(normalized))
    } else if (normalized.startsWith("hsl")) {
      const m = normalized.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0]
      setHsl([m[0] ?? 0, m[1] ?? 0, m[2] ?? 0])
    }
  }, [color])

  const hslRef = React.useRef(hsl)
  React.useEffect(() => {
    hslRef.current = hsl
  }, [hsl])

  const handleHueChange = (hue: number) => {
    const current = hslRef.current
    const next: [number, number, number] = [hue, current[1], current[2]]
    setHsl(next)
    applyColor(`hsl(${next[0]}, ${next[1]}%, ${next[2]}%)`)
  }

  const computeSaturationLightness = React.useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      const rect = event.currentTarget.getBoundingClientRect()
      const x = Math.max(0, Math.min(event.clientX - rect.left, rect.width))
      const y = Math.max(0, Math.min(event.clientY - rect.top, rect.height))
      const s = Math.round((x / rect.width) * 100)
      const l = Math.round(100 - (y / rect.height) * 100)
      const current = hslRef.current
      const next: [number, number, number] = [current[0], s, l]
      setHsl(next)
      applyColor(`hsl(${next[0]}, ${next[1]}%, ${next[2]}%)`)
    },
    [applyColor],
  )

  const isDraggingAreaRef = React.useRef(false)

  const handleAreaPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    isDraggingAreaRef.current = true
    event.currentTarget.setPointerCapture(event.pointerId)
    computeSaturationLightness(event)
  }

  const handleAreaPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingAreaRef.current) return
    computeSaturationLightness(event)
  }

  const handleAreaPointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingAreaRef.current) return
    isDraggingAreaRef.current = false
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  const handleColorInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const value = event.target.value
    setColorInput(value)
    if (HEX_RE.test(value) || HSL_RE.test(value)) {
      applyColor(value)
    }
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          data-slot="color-picker-trigger"
          variant="outline"
          className={cn(
            "w-[200px] justify-start gap-2 px-2 text-left font-normal",
            className,
          )}
        >
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full border border-border/60 shadow-sm"
            style={{ backgroundColor: colorInput }}
          />
          <span className="flex-1 truncate text-foreground">
            {trimColorString(colorInput)}
          </span>
          <ChevronDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-slot="color-picker-content"
        className="w-[240px] gap-3 p-3"
      >
        <div
          data-slot="color-picker-area"
          role="presentation"
          className="relative h-40 w-full cursor-crosshair touch-none overflow-hidden rounded-md border border-border/60"
          style={{
            background: `
              linear-gradient(to top, rgba(0, 0, 0, 1), transparent),
              linear-gradient(to right, rgba(255, 255, 255, 1), rgba(255, 0, 0, 0)),
              hsl(${hsl[0]}, 100%, 50%)
            `,
          }}
          onPointerDown={handleAreaPointerDown}
          onPointerMove={handleAreaPointerMove}
          onPointerUp={handleAreaPointerUp}
          onPointerCancel={handleAreaPointerUp}
        >
          <div
            data-slot="color-picker-thumb"
            className="pointer-events-none absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-background shadow-md ring-1 ring-foreground/30"
            style={{
              left: `${hsl[1]}%`,
              top: `${100 - hsl[2]}%`,
              backgroundColor: `hsl(${hsl[0]}, ${hsl[1]}%, ${hsl[2]}%)`,
            }}
          />
        </div>
        <input
          data-slot="color-picker-hue"
          type="range"
          min={0}
          max={360}
          value={hsl[0]}
          onChange={(e) => handleHueChange(Number(e.target.value))}
          aria-label="Hue"
          className="h-3 w-full cursor-pointer appearance-none rounded-full border border-border/60 outline-none focus-visible:ring-3 focus-visible:ring-ring/50 [&::-moz-range-thumb]:size-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-2 [&::-moz-range-thumb]:border-background [&::-moz-range-thumb]:bg-foreground [&::-webkit-slider-thumb]:size-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-background [&::-webkit-slider-thumb]:bg-foreground"
          style={{
            background: `linear-gradient(to right,
              hsl(0, 100%, 50%), hsl(60, 100%, 50%), hsl(120, 100%, 50%),
              hsl(180, 100%, 50%), hsl(240, 100%, 50%), hsl(300, 100%, 50%), hsl(360, 100%, 50%)
            )`,
          }}
        />
        <div className="flex items-center gap-2">
          <Label htmlFor="color-picker-input" className="sr-only">
            Color
          </Label>
          <Input
            id="color-picker-input"
            data-slot="color-picker-input"
            type="text"
            value={colorInput}
            onChange={handleColorInputChange}
            placeholder="#RRGGBB or hsl(h, s%, l%)"
            className="h-8 flex-1 text-sm"
          />
          <span
            aria-hidden="true"
            className="size-8 shrink-0 rounded-md border border-border/60 shadow-sm"
            style={{ backgroundColor: colorInput }}
          />
        </div>
        <div
          data-slot="color-picker-presets"
          className="grid grid-cols-6 gap-2"
        >
          {presets.map((preset) => (
            <button
              key={preset}
              type="button"
              aria-label={`Select color ${preset}`}
              data-slot="color-picker-preset"
              onClick={() => applyColor(preset)}
              className="relative size-7 rounded-full border border-border/60 transition-transform outline-none hover:scale-110 focus-visible:ring-3 focus-visible:ring-ring/50"
              style={{ backgroundColor: preset }}
            >
              {colorInput.toUpperCase() === preset.toUpperCase() && (
                <CheckIcon
                  aria-hidden="true"
                  className="absolute inset-0 m-auto size-3.5 text-primary-foreground drop-shadow"
                />
              )}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}

export { ColorPicker }
