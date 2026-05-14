"use client"

import * as React from "react"
import { Autocomplete as AutocompletePrimitive } from "@base-ui/react/autocomplete"
import { ChevronsUpDownIcon, XIcon } from "@workspace/ui/lib/icons"

import { cn } from "@workspace/ui/lib/utils"
import { ScrollArea } from "@workspace/ui/components/scroll-area"

const Autocomplete = AutocompletePrimitive.Root

function AutocompleteInput({
  className,
  showTrigger = false,
  showClear = false,
  startAddon,
  triggerProps,
  clearProps,
  ...props
}: AutocompletePrimitive.Input.Props & {
  showTrigger?: boolean
  showClear?: boolean
  startAddon?: React.ReactNode
  triggerProps?: AutocompletePrimitive.Trigger.Props
  clearProps?: AutocompletePrimitive.Clear.Props
}) {
  return (
    <AutocompletePrimitive.InputGroup
      data-slot="autocomplete-input-group"
      className="relative w-full text-foreground has-disabled:opacity-50"
    >
      {startAddon && (
        <div
          aria-hidden="true"
          data-slot="autocomplete-start-addon"
          className="pointer-events-none absolute inset-y-0 start-px z-10 flex items-center ps-2.5 opacity-80 [&_svg]:-mx-0.5 [&_svg:not([class*='size-'])]:size-4"
        >
          {startAddon}
        </div>
      )}
      <AutocompletePrimitive.Input
        data-slot="autocomplete-input"
        className={cn(
          "flex h-8 w-full min-w-0 rounded-lg border border-input bg-transparent px-2.5 py-1 text-base transition-colors outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive md:text-sm dark:bg-input/30",
          startAddon && "ps-8",
          (showTrigger || showClear) && "pe-8",
          className,
        )}
        {...props}
      />
      {showTrigger && (
        <AutocompleteTrigger
          className="absolute end-0.5 top-1/2 inline-flex size-7 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md opacity-80 outline-none hover:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          {...triggerProps}
        >
          <AutocompletePrimitive.Icon data-slot="autocomplete-icon">
            <ChevronsUpDownIcon />
          </AutocompletePrimitive.Icon>
        </AutocompleteTrigger>
      )}
      {showClear && (
        <AutocompleteClear
          className="absolute end-0.5 top-1/2 inline-flex size-7 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md opacity-80 outline-none hover:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4"
          {...clearProps}
        >
          <XIcon />
        </AutocompleteClear>
      )}
    </AutocompletePrimitive.InputGroup>
  )
}

function AutocompletePopup({
  className,
  children,
  side = "bottom",
  sideOffset = 4,
  alignOffset,
  align = "start",
  anchor,
  portalProps,
  ...props
}: AutocompletePrimitive.Popup.Props & {
  align?: AutocompletePrimitive.Positioner.Props["align"]
  sideOffset?: AutocompletePrimitive.Positioner.Props["sideOffset"]
  alignOffset?: AutocompletePrimitive.Positioner.Props["alignOffset"]
  side?: AutocompletePrimitive.Positioner.Props["side"]
  anchor?: AutocompletePrimitive.Positioner.Props["anchor"]
  portalProps?: AutocompletePrimitive.Portal.Props
}) {
  return (
    <AutocompletePrimitive.Portal {...portalProps}>
      <AutocompletePrimitive.Positioner
        data-slot="autocomplete-positioner"
        align={align}
        alignOffset={alignOffset}
        anchor={anchor}
        side={side}
        sideOffset={sideOffset}
        className="z-50 select-none"
      >
        <span
          className={cn(
            "relative flex max-h-full max-w-(--available-width) min-w-(--anchor-width) origin-(--transform-origin) rounded-lg border border-border bg-popover text-popover-foreground shadow-md",
            className,
          )}
        >
          <AutocompletePrimitive.Popup
            data-slot="autocomplete-popup"
            className="flex max-h-[min(var(--available-height),23rem)] flex-1 flex-col text-foreground"
            {...props}
          >
            {children}
          </AutocompletePrimitive.Popup>
        </span>
      </AutocompletePrimitive.Positioner>
    </AutocompletePrimitive.Portal>
  )
}

function AutocompleteItem({
  className,
  children,
  ...props
}: AutocompletePrimitive.Item.Props) {
  return (
    <AutocompletePrimitive.Item
      data-slot="autocomplete-item"
      className={cn(
        "flex min-h-8 cursor-default items-center rounded-sm px-2 py-1 text-base outline-none select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground sm:min-h-7 sm:text-sm data-disabled:pointer-events-none data-disabled:opacity-50",
        className,
      )}
      {...props}
    >
      {children}
    </AutocompletePrimitive.Item>
  )
}

function AutocompleteSeparator({
  className,
  ...props
}: AutocompletePrimitive.Separator.Props) {
  return (
    <AutocompletePrimitive.Separator
      data-slot="autocomplete-separator"
      className={cn("mx-2 my-1 h-px bg-border last:hidden", className)}
      {...props}
    />
  )
}

function AutocompleteGroup({
  className,
  ...props
}: AutocompletePrimitive.Group.Props) {
  return (
    <AutocompletePrimitive.Group
      data-slot="autocomplete-group"
      className={cn("[[role=group]+&]:mt-1.5", className)}
      {...props}
    />
  )
}

function AutocompleteGroupLabel({
  className,
  ...props
}: AutocompletePrimitive.GroupLabel.Props) {
  return (
    <AutocompletePrimitive.GroupLabel
      data-slot="autocomplete-group-label"
      className={cn(
        "px-2 py-1.5 text-xs font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

function AutocompleteEmpty({
  className,
  ...props
}: AutocompletePrimitive.Empty.Props) {
  return (
    <AutocompletePrimitive.Empty
      data-slot="autocomplete-empty"
      className={cn(
        "text-center text-base text-muted-foreground not-empty:p-2 sm:text-sm",
        className,
      )}
      {...props}
    />
  )
}

function AutocompleteList({
  className,
  ...props
}: AutocompletePrimitive.List.Props) {
  return (
    <ScrollArea data-slot="autocomplete-list-scroll" className="w-full">
      <AutocompletePrimitive.List
        data-slot="autocomplete-list"
        className={cn("not-empty:scroll-py-1 not-empty:p-1", className)}
        {...props}
      />
    </ScrollArea>
  )
}

function AutocompleteClear({
  className,
  ...props
}: AutocompletePrimitive.Clear.Props) {
  return (
    <AutocompletePrimitive.Clear
      data-slot="autocomplete-clear"
      className={cn(
        "absolute end-0.5 top-1/2 inline-flex size-7 shrink-0 -translate-y-1/2 cursor-pointer items-center justify-center rounded-md opacity-80 outline-none hover:opacity-100 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      <XIcon />
    </AutocompletePrimitive.Clear>
  )
}

function AutocompleteStatus({
  className,
  ...props
}: AutocompletePrimitive.Status.Props) {
  return (
    <AutocompletePrimitive.Status
      data-slot="autocomplete-status"
      className={cn(
        "px-3 py-2 text-xs font-medium text-muted-foreground empty:m-0 empty:p-0",
        className,
      )}
      {...props}
    />
  )
}

function AutocompleteCollection({
  ...props
}: AutocompletePrimitive.Collection.Props) {
  return (
    <AutocompletePrimitive.Collection
      data-slot="autocomplete-collection"
      {...props}
    />
  )
}

function AutocompleteTrigger({
  className,
  children,
  ...props
}: AutocompletePrimitive.Trigger.Props) {
  return (
    <AutocompletePrimitive.Trigger
      data-slot="autocomplete-trigger"
      className={className}
      {...props}
    >
      {children}
    </AutocompletePrimitive.Trigger>
  )
}

const useAutocompleteFilter = AutocompletePrimitive.useFilter

export {
  Autocomplete,
  AutocompleteClear,
  AutocompleteCollection,
  AutocompleteEmpty,
  AutocompleteGroup,
  AutocompleteGroupLabel,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
  AutocompleteSeparator,
  AutocompleteStatus,
  AutocompleteTrigger,
  useAutocompleteFilter,
  AutocompletePrimitive,
}
