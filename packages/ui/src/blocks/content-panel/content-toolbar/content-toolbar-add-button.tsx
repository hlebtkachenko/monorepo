"use client"

import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { useIcons } from "@workspace/ui/icon-packs"

import type { AddDescriptor } from "./toolbar-descriptors"

/**
 * The `add` slot (toolbar right #3) — a primary "[+ label]" Button wired to
 * `onAdd`. When `variants[]` are supplied it becomes a split button: the
 * primary action plus a ButtonGroup chevron opening a DropdownMenu of variants,
 * each firing `onSelectVariant(id)`. Every icon resolves by NAME via
 * `useIcons()`, never a raw node.
 */
export function ContentToolbarAddButton({
  label = "Add",
  icon = "Plus",
  onAdd,
  variants,
  onSelectVariant,
  align = "end",
  disabled,
}: AddDescriptor) {
  const icons = useIcons()
  const AddIcon = icons[icon]
  const ChevronIcon = icons.ChevronDown

  const primary = (
    <Button size="sm" disabled={disabled} onClick={onAdd}>
      <AddIcon />
      {label}
    </Button>
  )

  if (!variants || variants.length === 0) return primary

  return (
    <ButtonGroup>
      {primary}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon-sm" aria-label="Choose type" disabled={disabled}>
            <ChevronIcon />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="min-w-40">
          {variants.map((variant) => {
            const VariantIcon = variant.icon ? icons[variant.icon] : null
            return (
              <DropdownMenuItem
                key={variant.id}
                disabled={variant.disabled}
                onSelect={() => onSelectVariant?.(variant.id)}
              >
                {VariantIcon ? <VariantIcon /> : null}
                {variant.label}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </ButtonGroup>
  )
}
