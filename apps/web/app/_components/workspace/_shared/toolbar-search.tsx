"use client"

import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
} from "@workspace/ui/components/input-group"
import { Search } from "@workspace/ui/lib/icons"
import { cn } from "@workspace/ui/lib/utils"

/**
 * The one workspace-tier toolbar search — an `InputGroup` with a leading Search
 * addon. Replaces the four hand-rolled `Input` + absolutely-positioned icon
 * copies (companies, legislation, team, …) so the icon-in-input treatment,
 * width behaviour, and focus ring come from the primitive. Width shrinks on a
 * narrow panel (`max-w-72 min-w-0`), so it never overflows the toolbar.
 */
export function ToolbarSearch({
  value,
  onChange,
  placeholder = "Search…",
  className,
}: {
  value: string
  onChange: (value: string) => void
  placeholder?: string
  className?: string
}) {
  return (
    <InputGroup className={cn("h-7 w-full max-w-72 min-w-0", className)}>
      <InputGroupAddon>
        <Search className="size-4 text-muted-foreground" />
      </InputGroupAddon>
      <InputGroupInput
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </InputGroup>
  )
}
