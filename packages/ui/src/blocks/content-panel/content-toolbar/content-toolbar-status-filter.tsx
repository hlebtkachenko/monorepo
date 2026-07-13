"use client"

import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"
import { Separator } from "@workspace/ui/components/separator"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import type { StatusFilterDescriptor } from "./toolbar-descriptors"

/**
 * SSF — the processing-status faceted multi-select.
 *
 * The reference reuses DataTableFacetedFilter, but that base is COLUMN-driven
 * (it reads/writes a TanStack column's filter value). Our descriptor speaks
 * value/onChange directly, so we build a small standalone faceted select that
 * mirrors the DataTableFacetedFilter look — a dashed-outline trigger showing
 * selected badges over a Popover + Command checklist — reading value/onChange
 * with no fake-column shim. Icons resolve by NAME via useIcons().
 */
export function ContentToolbarStatusFilter({
  title,
  options,
  value,
  onChange,
  multiple,
  open: openProp,
  onOpenChange,
}: StatusFilterDescriptor) {
  const icons = useIcons()
  const CheckIcon = icons.Check
  const PlusCircleIcon = icons.PlusCircle
  const XCircleIcon = icons.XCircle

  const [openState, setOpenState] = React.useState(false)
  const open = openProp ?? openState
  const setOpen = React.useCallback(
    (next: boolean) => {
      // Only track state internally when uncontrolled; otherwise the prop is
      // the single source of truth and we just notify the consumer.
      if (openProp === undefined) setOpenState(next)
      onOpenChange?.(next)
    },
    [onOpenChange, openProp],
  )

  const selectedValues = React.useMemo(() => new Set(value), [value])

  const onItemSelect = React.useCallback(
    (optionValue: string, isSelected: boolean) => {
      if (multiple) {
        const next = new Set(selectedValues)
        if (isSelected) {
          next.delete(optionValue)
        } else {
          next.add(optionValue)
        }
        onChange(Array.from(next))
      } else {
        onChange(isSelected ? [] : [optionValue])
        setOpen(false)
      }
    },
    [multiple, onChange, selectedValues, setOpen],
  )

  const onReset = React.useCallback(
    (event?: React.MouseEvent) => {
      event?.stopPropagation()
      onChange([])
    },
    [onChange],
  )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          data-slot="content-toolbar-status-filter-trigger"
          variant="outline"
          size="sm"
          className="border-dashed font-normal"
        >
          {selectedValues.size > 0 ? (
            <div
              role="button"
              aria-label={`Clear ${title} filter`}
              tabIndex={0}
              className="rounded-sm opacity-70 transition-opacity hover:opacity-100 focus-visible:ring-1 focus-visible:ring-ring focus-visible:outline-none"
              onClick={onReset}
            >
              <XCircleIcon />
            </div>
          ) : (
            <PlusCircleIcon />
          )}
          {title}
          {selectedValues.size > 0 && (
            <>
              <Separator orientation="vertical" inset className="mx-0.5 !h-4" />
              <Badge
                variant="secondary"
                className="rounded-sm px-1 font-normal lg:hidden"
              >
                {selectedValues.size}
              </Badge>
              <div className="hidden items-center gap-1 lg:flex">
                {selectedValues.size > 2 ? (
                  <Badge
                    variant="secondary"
                    className="rounded-sm px-1 font-normal"
                  >
                    {selectedValues.size} selected
                  </Badge>
                ) : (
                  options
                    .filter((option) => selectedValues.has(option.value))
                    .map((option) => (
                      <Badge
                        key={option.value}
                        variant="secondary"
                        className="rounded-sm px-1 font-normal"
                      >
                        {option.label}
                      </Badge>
                    ))
                )}
              </div>
            </>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        data-slot="content-toolbar-status-filter"
        className="w-52 p-0"
        align="start"
      >
        <Command>
          <CommandInput placeholder={title} />
          <CommandList className="max-h-full">
            <CommandEmpty>No results found.</CommandEmpty>
            <CommandGroup className="max-h-[300px] scroll-py-1 overflow-x-hidden overflow-y-auto">
              {options.map((option) => {
                const isSelected = selectedValues.has(option.value)
                const OptionIcon = option.icon ? icons[option.icon] : null
                return (
                  <CommandItem
                    key={option.value}
                    onSelect={() => onItemSelect(option.value, isSelected)}
                  >
                    <div
                      className={cn(
                        "flex size-4 items-center justify-center rounded-sm border border-primary",
                        isSelected
                          ? "bg-primary text-primary-foreground"
                          : "opacity-50 [&_svg]:invisible",
                      )}
                    >
                      <CheckIcon className="size-3" />
                    </div>
                    {OptionIcon ? <OptionIcon /> : null}
                    <span className="truncate">{option.label}</span>
                    {option.count !== undefined ? (
                      <span className="ml-auto font-mono text-xs text-muted-foreground">
                        {option.count}
                      </span>
                    ) : null}
                  </CommandItem>
                )
              })}
            </CommandGroup>
            {selectedValues.size > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup>
                  <CommandItem
                    onSelect={() => onReset()}
                    className="justify-center text-center"
                  >
                    Clear filters
                  </CommandItem>
                </CommandGroup>
              </>
            )}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
