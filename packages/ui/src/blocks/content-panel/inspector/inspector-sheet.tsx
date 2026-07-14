"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { IconButton } from "@workspace/ui/components/icon-button"
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@workspace/ui/components/sheet"
import { Upload } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

/** One header meta cell — a small label over a value or a Badge. */
export interface InspectorMetaItem {
  readonly label: string
  readonly value: React.ReactNode
}

export interface InspectorSheetProps {
  /** Whether the sheet is shown. */
  open: boolean
  /** Fired with `false` when the user dismisses (X / overlay / Esc). */
  onOpenChange: (open: boolean) => void
  /** Bold identifier line — e.g. an invoice number (`#FP-2026-0001`). */
  title: React.ReactNode
  /** When set, a copy affordance sits beside the title. */
  onCopyTitle?: () => void
  /** Muted line under the title (e.g. "Invoice details"). */
  subtitle?: React.ReactNode
  /** Header meta grid (up to three cells): Issued / Payment / Status. */
  meta?: readonly InspectorMetaItem[]
  /** Scrollable detail sections (compose with the `Inspector*` parts). */
  children?: React.ReactNode
  /** Sticky footer actions — kept OUTSIDE the scroll region. */
  footer?: React.ReactNode
  /** Which edge the sheet docks to. Default "right". */
  side?: "right" | "left"
}

/**
 * InspectorSheet — the right-docked detail surface for the row chosen in a Table
 * archetype (an invoice, a transaction, …). Built on OUR `Sheet` (Radix Dialog,
 * portals out) so its tree position is irrelevant. Three regions:
 *   - a PINNED header on the muted band (title + copy + close, a subtitle, and a
 *     three-cell meta grid) that never scrolls,
 *   - a SCROLL body holding the composed `Inspector*` sections,
 *   - a STICKY footer for the primary actions on the record.
 * All chrome uses the in-flow shadcn tokens (`bg-popover`, `bg-muted`, `border`).
 * The body content is domain-specific — the caller composes it from the exported
 * parts (`InspectorSection`, `InspectorDetailList`, `InspectorLineItem`, …).
 */
export function InspectorSheet({
  open,
  onOpenChange,
  title,
  onCopyTitle,
  subtitle,
  meta,
  children,
  footer,
  side = "right",
}: InspectorSheetProps) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side={side}
        showCloseButton={false}
        className="gap-0 p-0 sm:max-w-[600px]"
      >
        {/* PINNED header — muted band, does not scroll. */}
        <div className="shrink-0 border-b border-border bg-muted/40">
          <div className="flex items-start gap-3 px-6 pt-5 pb-4">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-1.5">
                <SheetTitle className="truncate text-xl font-semibold tracking-tight text-foreground">
                  {title}
                </SheetTitle>
                {onCopyTitle ? (
                  <IconButton
                    icon="Copy"
                    iconSize={15}
                    tooltip="Copy"
                    tooltipSide="bottom"
                    className="size-7"
                    onClick={onCopyTitle}
                  />
                ) : null}
              </div>
              {subtitle != null ? (
                <SheetDescription className="mt-1 text-sm text-muted-foreground">
                  {subtitle}
                </SheetDescription>
              ) : (
                <SheetDescription className="sr-only">Details</SheetDescription>
              )}
            </div>
            <IconButton
              icon="X"
              iconSize={18}
              tooltip="Close"
              tooltipSide="bottom"
              className="size-8"
              onClick={() => onOpenChange(false)}
            />
          </div>

          {meta && meta.length > 0 ? (
            <div className="grid grid-cols-3 gap-4 px-6 pb-5">
              {meta.map((item) => (
                <div key={item.label} className="min-w-0">
                  <div className="mb-2 truncate text-xs text-muted-foreground">
                    {item.label}
                  </div>
                  <div className="text-sm font-medium text-foreground">
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* SCROLL body — the composed detail sections. */}
        <div className="min-h-0 flex-1 overflow-y-auto">{children}</div>

        {/* STICKY footer — primary record actions. */}
        {footer ? (
          <div
            data-slot="inspector-sheet-footer"
            className="flex shrink-0 gap-2.5 border-t border-border bg-popover p-3.5"
          >
            {footer}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

/**
 * A body section: a heading, an optional count Badge and a trailing action slot,
 * then the section body. Sections stack with a hairline top border (the first has
 * none) — matching the reference's Details / Items / Evidence rhythm.
 */
export function InspectorSection({
  title,
  count,
  action,
  children,
  className,
}: {
  title: React.ReactNode
  count?: number
  action?: React.ReactNode
  children: React.ReactNode
  className?: string
}) {
  return (
    <section
      className={cn(
        "border-t border-border px-6 py-5 first:border-t-0",
        className,
      )}
    >
      <div className="mb-4 flex items-center gap-2">
        <h3 className="text-base font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        {count != null ? (
          <Badge variant="secondary" className="rounded-full tabular-nums">
            {count}
          </Badge>
        ) : null}
        {action != null ? <div className="ml-auto">{action}</div> : null}
      </div>
      {children}
    </section>
  )
}

/** The label/value list used by the Details section. */
export function InspectorDetailList({
  children,
}: {
  children: React.ReactNode
}) {
  return <dl className="flex flex-col gap-4 text-sm">{children}</dl>
}

/** One `label … value` row — a fixed 8rem label column, then the value. */
export function InspectorDetail({
  label,
  children,
}: {
  label: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <div className="flex items-start gap-4">
      <dt className="w-32 shrink-0 pt-px text-muted-foreground">{label}</dt>
      <dd className="min-w-0 flex-1 font-medium text-foreground">{children}</dd>
    </div>
  )
}

/** One line-item row: title + optional subtitle, quantity, amount, edit. */
export function InspectorLineItem({
  title,
  subtitle,
  quantity,
  amount,
  onEdit,
}: {
  title: React.ReactNode
  subtitle?: React.ReactNode
  quantity?: React.ReactNode
  amount: React.ReactNode
  onEdit?: () => void
}) {
  return (
    <div className="flex items-center gap-3 border-t border-border py-3 first:border-t-0 first:pt-0">
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-semibold text-foreground">
          {title}
        </div>
        {subtitle != null ? (
          <div className="mt-0.5 truncate text-xs text-muted-foreground">
            {subtitle}
          </div>
        ) : null}
      </div>
      {quantity != null ? (
        <span className="w-7 shrink-0 text-center text-xs text-muted-foreground tabular-nums">
          {quantity}
        </span>
      ) : null}
      <span className="w-24 shrink-0 text-right text-sm font-semibold text-foreground tabular-nums">
        {amount}
      </span>
      {onEdit ? (
        <IconButton
          icon="Pencil"
          iconSize={15}
          tooltip="Edit"
          tooltipSide="left"
          className="size-7"
          onClick={onEdit}
        />
      ) : null}
    </div>
  )
}

/** One attached-evidence row: leading icon, name, an optional meta chip, and
 *  download / more affordances. */
export function InspectorEvidenceItem({
  icon,
  name,
  meta,
  onDownload,
  onMore,
}: {
  icon: React.ReactNode
  name: React.ReactNode
  meta?: React.ReactNode
  onDownload?: () => void
  onMore?: () => void
}) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border px-3.5 py-3">
      <span className="shrink-0 text-muted-foreground [&>svg]:size-[17px]">
        {icon}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
        {name}
      </span>
      {meta != null ? <span className="shrink-0">{meta}</span> : null}
      {onDownload ? (
        <IconButton
          icon="Download"
          iconSize={16}
          tooltip="Download"
          tooltipSide="top"
          className="size-7"
          onClick={onDownload}
        />
      ) : null}
      {onMore ? (
        <IconButton
          icon="Ellipsis"
          iconSize={17}
          tooltip="More"
          tooltipSide="top"
          className="size-7"
          onClick={onMore}
        />
      ) : null}
    </div>
  )
}

/** The dashed upload target — click to browse, or drag a file onto it. */
export function InspectorDropzone({
  hint,
  sizeHint,
  onBrowse,
}: {
  hint: React.ReactNode
  sizeHint?: React.ReactNode
  onBrowse?: () => void
}) {
  return (
    <button
      type="button"
      onClick={onBrowse}
      className="flex w-full flex-col items-center gap-2 rounded-xl border border-dashed border-border px-5 py-6 text-center transition-colors hover:border-muted-foreground/40 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <Upload className="size-5 text-muted-foreground" />
      <span className="text-sm text-foreground">{hint}</span>
      {sizeHint != null ? (
        <span className="text-xs text-muted-foreground">{sizeHint}</span>
      ) : null}
    </button>
  )
}
