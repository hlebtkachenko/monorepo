"use client"

import * as React from "react"
import { Slot } from "radix-ui"

import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useIcons, type IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

export interface IconButtonProps extends Omit<
  React.ComponentPropsWithoutRef<"button">,
  "type"
> {
  /** Icon-pack glyph name. Omit only when supplying a custom `iconNode`. */
  icon?: IconName
  /**
   * Custom glyph node, used instead of a pack `icon` (e.g. a brand SVG).
   * Size it yourself to `--icon-size`; it won't inherit the icon tokens.
   */
  iconNode?: React.ReactNode
  /** Optional label. Present → "icon + text"; absent → icon-only square. */
  label?: React.ReactNode
  /**
   * Where the label sits relative to the icon:
   *   - `"beside"` → horizontal pill; the whole rectangle is the hover
   *     surface; 13px label (`--icon-label-size`).
   *   - `"below"`  → stacked; the icon square is the hover surface, the
   *     small label sits under it (`--rail-label-*`).
   * Ignored for icon-only. Default `"beside"`.
   */
  labelPosition?: "beside" | "below"
  /** Selected/active state — paints the active tokens. */
  active?: boolean
  /**
   * Color treatment. `"default"` → idle transparent, hover/selected add a
   * box (`--icon-*`). `"sidekick"` → inverted: idle shows a box
   * (`--sidekick-idle-bg`), hover clears it, selected paints
   * `--sidekick-active-bg`. Only affects the horizontal/icon-only form.
   */
  tone?: "default" | "sidekick"
  /** Glyph size in px. Default: `--icon-size` (20). */
  iconSize?: number
  /** Glyph stroke width (lucide). Default: pack default. */
  iconStrokeWidth?: number
  /** Render as a link (`<a>`) instead of a `<button>`. */
  href?: string
  /** Merge props onto a child element (e.g. a Next.js `<Link>`). */
  asChild?: boolean
  /**
   * Forwarded to the root element so the whole button can act as a Radix
   * `asChild` trigger (DropdownMenu / Popover). Flows via prop spread —
   * React 19 ref-as-prop, no forwardRef needed.
   */
  ref?: React.Ref<HTMLElement>
  /**
   * Tooltip content. Omit → no tooltip. NOTE: when set, the component
   * returns a `<TooltipProvider>` tree, not a DOM node — so do NOT also
   * use this IconButton as another Radix `asChild` trigger (e.g.
   * DropdownMenuTrigger). For "button with tooltip AND a menu", omit this
   * prop and wrap the trigger in your own `<Tooltip>` instead.
   */
  tooltip?: React.ReactNode
  /** Tooltip side. Default `"right"`. */
  tooltipSide?: "top" | "right" | "bottom" | "left"
  /** Exact tooltip gap / safe-zone (Radix `sideOffset`). Default `4`. */
  tooltipSideOffset?: number
  /** Button type when rendered as `<button>`. Default `"button"`. */
  type?: "button" | "submit" | "reset"
}

/**
 * Standardized clickable icon tile — the single source for the icon-box
 * look across the app (rail, header, …). Forms:
 *   - icon-only          → a `size-8` square (optionally with a tooltip)
 *   - icon+label "beside" → a rectangle: glyph + `--icon-label-gap` + label
 *   - icon+label "below"  → stacked: the icon square + a small label under it
 *
 * The whole element is the click target (a `<button>`, or `<a>` with
 * `href`, or any element via `asChild`). State colors come from the
 * generic `--icon*` tokens: idle `text-icon`, hover `bg-icon-hover-bg`,
 * selected (`active`) `text-icon-active` + `bg-icon-active-bg`.
 */
export function IconButton({
  icon,
  iconNode,
  label,
  labelPosition = "beside",
  active,
  tone = "default",
  iconSize,
  iconStrokeWidth,
  href,
  asChild,
  tooltip,
  tooltipSide = "right",
  tooltipSideOffset = 4,
  type = "button",
  className,
  ...props
}: IconButtonProps) {
  const icons = useIcons()
  const Icon = icon ? icons[icon] : null
  const labeled = label != null
  const stacked = labeled && labelPosition === "below"

  const glyph =
    iconNode ??
    (Icon ? (
      <Icon
        className={cn("shrink-0", !iconSize && "size-[var(--icon-size)]")}
        style={iconSize ? { width: iconSize, height: iconSize } : undefined}
        strokeWidth={iconStrokeWidth}
      />
    ) : null)

  let rootClasses: string
  let inner: React.ReactNode

  if (stacked) {
    // The icon SQUARE is the hover/active surface; the label sits under
    // it and only changes color. Root is layout-only (state via `group`).
    rootClasses = cn(
      "group flex flex-col items-center gap-[var(--rail-icon-label-gap)] transition-transform outline-none active:translate-y-px",
      "disabled:pointer-events-none disabled:opacity-50",
      className,
    )
    inner = (
      <>
        {/* Keyboard focus ring lives on the icon square — the same
            surface that paints hover/active. */}
        <span className="flex size-8 items-center justify-center rounded-sm text-icon group-hover:bg-icon-hover-bg group-focus-visible:ring-2 group-focus-visible:ring-ring/50 group-data-[active]:bg-icon-active-bg group-data-[active]:text-icon-active">
          {glyph}
        </span>
        <span className="w-full truncate px-0.5 text-center text-[length:var(--rail-label-size)] leading-tight font-[number:var(--rail-label-weight)] tracking-[var(--rail-label-tracking)] text-rail-label group-hover:text-rail-label-active group-data-[active]:text-rail-label-active">
          {label}
        </span>
      </>
    )
  } else {
    // icon-only square, or a horizontal pill — the whole element is the
    // hover/active surface.
    rootClasses = cn(
      "group inline-flex shrink-0 items-center rounded-sm text-icon transition-[background-color,transform] outline-none focus-visible:ring-2 focus-visible:ring-ring/50 active:translate-y-px",
      // `data-[active]` = explicit selected prop; `aria-expanded` = this
      // button is an open menu/popover trigger — both paint the selected box.
      tone === "sidekick"
        ? // Inverted treatment: idle box shown, hover clears it, selected
          // paints the unique tone (Sidekick / AI assistant button). The
          // label + any currentColor glyph read in the high-contrast fg.
          "bg-sidekick-idle-bg text-icon-active hover:bg-transparent aria-expanded:bg-sidekick-active-bg data-[active]:bg-sidekick-active-bg"
        : "hover:bg-icon-hover-bg aria-expanded:bg-icon-active-bg aria-expanded:text-icon-active data-[active]:bg-icon-active-bg data-[active]:text-icon-active",
      "disabled:pointer-events-none disabled:opacity-50",
      labeled
        ? "h-8 gap-[var(--icon-label-gap)] pr-2.5 pl-1.5"
        : "size-8 justify-center",
      className,
    )
    inner = (
      <>
        {glyph}
        {labeled && (
          <span className="truncate text-[length:var(--icon-label-size)] leading-none font-medium">
            {label}
          </span>
        )}
      </>
    )
  }

  const Comp = asChild ? Slot.Root : href ? "a" : "button"
  const elementProps: Record<string, unknown> = {
    "data-slot": "icon-button",
    "data-active": active || undefined,
    className: rootClasses,
    // Icon-only needs an accessible name; fall back to a string tooltip.
    "aria-label": !labeled && typeof tooltip === "string" ? tooltip : undefined,
    ...props,
  }
  if (Comp === "button") elementProps.type = type
  if (href) elementProps.href = href

  const node = <Comp {...elementProps}>{inner}</Comp>

  if (tooltip == null) return node
  return (
    <TooltipProvider delayDuration={200}>
      <Tooltip>
        <TooltipTrigger asChild>{node}</TooltipTrigger>
        <TooltipContent side={tooltipSide} sideOffset={tooltipSideOffset}>
          {tooltip}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
