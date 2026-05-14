"use client"

import * as React from "react"
import {
  Combobox as ComboboxPrimitive,
  type ComboboxRootChangeEventDetails,
} from "@base-ui/react"
import { PlusIcon } from "@workspace/ui/lib/icons"

import { cn } from "@workspace/ui/lib/utils"
import { Combobox } from "@workspace/ui/components/combobox"

// ─── creatable item ───────────────────────────────────────────────────────────

type CreatableItem = {
  creatable: true
  label: string
  value: string
}

const isCreatableItem = (item: unknown): item is CreatableItem => {
  return (
    typeof item === "object" &&
    item !== null &&
    (item as CreatableItem).creatable === true
  )
}

// ─── internal helpers ─────────────────────────────────────────────────────────

const toLabel = (item: unknown): string => {
  if (typeof item === "string") return item
  if (item && typeof item === "object") {
    if ("label" in item) return String((item as { label: unknown }).label)
    if ("value" in item) return String((item as { value: unknown }).value)
  }
  return String(item)
}

const toValueKey = (item: unknown): string => {
  if (typeof item === "string") return item
  if (item && typeof item === "object") {
    if ("value" in item) return String((item as { value: unknown }).value)
    if ("label" in item) return String((item as { label: unknown }).label)
  }
  return String(item)
}

// ─── creatable combobox ───────────────────────────────────────────────────────

type ComboboxRootProps = React.ComponentProps<typeof ComboboxPrimitive.Root>

type CreatableComboboxProps = ComboboxRootProps & {
  /** Called when the user confirms a new value not present in the list. */
  onCreateValue: (value: string) => void
  /** Label for the "Create" option. Defaults to `Create "${value}"`. */
  createLabel?: (value: string) => string
  /** Where the create option appears in the list. Defaults to "first". */
  createOptionPosition?: "first" | "last"
}

/**
 * Combobox that allows the user to create new values.
 *
 * Follows the base-ui creatable combobox example:
 * https://base-ui.com/react/components/combobox#creatable
 */
function CreatableCombobox({
  children,
  items = [],
  onCreateValue,
  createLabel = (v) => `Create "${v}"`,
  createOptionPosition = "first",
  ...props
}: CreatableComboboxProps) {
  const [query, setQuery] = React.useState<string>("")
  const pendingCreateRef = React.useRef<string | null>(null)

  const augmentedItems = React.useMemo(() => {
    const trimmedQuery = query.trim()
    if (!trimmedQuery) return items

    const lowered = trimmedQuery.toLocaleLowerCase()
    const exactMatch = items.some(
      (item) => toLabel(item).toLocaleLowerCase() === lowered,
    )
    if (exactMatch) return items

    const createItem: CreatableItem = {
      creatable: true,
      label: createLabel(trimmedQuery),
      value: trimmedQuery,
    }

    return createOptionPosition === "first"
      ? [createItem, ...items]
      : [...items, createItem]
  }, [query, items, createLabel, createOptionPosition])

  const handleValueChange = (
    next: unknown,
    details: ComboboxRootChangeEventDetails,
  ) => {
    if (props.multiple && Array.isArray(next)) {
      const creatable = next.find(isCreatableItem)
      const clean = next.filter((item) => !isCreatableItem(item))
      if (creatable) {
        pendingCreateRef.current = creatable.value
        setQuery("")
      }
      props.onValueChange?.(clean, details)
      return
    }

    if (isCreatableItem(next)) {
      pendingCreateRef.current = next.value
      setQuery("")
    }

    props.onValueChange?.(next, details)
  }

  return (
    <Combobox
      {...props}
      items={augmentedItems}
      inputValue={query}
      onInputValueChange={setQuery}
      onValueChange={handleValueChange}
      onOpenChangeComplete={(open) => {
        if (!open && pendingCreateRef.current) {
          onCreateValue(pendingCreateRef.current)
          pendingCreateRef.current = null
        }
        props.onOpenChangeComplete?.(open)
      }}
      itemToStringLabel={(item: unknown): string => {
        if (isCreatableItem(item)) return item.value
        return props.itemToStringLabel?.(item) ?? toLabel(item)
      }}
      isItemEqualToValue={(a: unknown, b: unknown) => {
        if (isCreatableItem(a) || isCreatableItem(b)) {
          return toValueKey(a) === toValueKey(b)
        }
        return props.isItemEqualToValue?.(a, b) ?? Object.is(a, b)
      }}
    >
      {children}
    </Combobox>
  )
}

// ─── creatable item renderer ──────────────────────────────────────────────────

function ComboboxItemCreatable({
  className,
  children,
  value,
  showPlus = true,
  ...props
}: Omit<ComboboxPrimitive.Item.Props, "value"> & {
  value: CreatableItem
  showPlus?: boolean
}) {
  return (
    <ComboboxPrimitive.Item
      data-slot="combobox-item-creatable"
      data-creatable=""
      value={value}
      className={cn(
        "relative flex w-full cursor-default items-center gap-2 rounded-md py-1 pr-8 pl-1.5 text-sm outline-hidden select-none data-highlighted:bg-accent data-highlighted:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
        className,
      )}
      {...props}
    >
      {showPlus && <PlusIcon className="size-3.5 shrink-0 opacity-60" />}
      {children ?? value.label}
    </ComboboxPrimitive.Item>
  )
}

export {
  CreatableCombobox,
  ComboboxItemCreatable,
  isCreatableItem,
  type CreatableComboboxProps,
  type CreatableItem,
}
