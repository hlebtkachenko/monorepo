"use client"

import { Input } from "@workspace/ui/components/input"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import type { SearchDescriptor } from "./toolbar-descriptors"

/**
 * The toolbar's universal text search (left #2) — a leading Search icon over an
 * Input, fully driven by the `SearchDescriptor`. Visual output matches the
 * reference toolbar's search block exactly.
 */
export function ContentToolbarSearch({
  value,
  onChange,
  placeholder = "Search anything…",
}: SearchDescriptor) {
  const icons = useIcons()
  const SearchIcon = icons.Search
  const ClearIcon = icons.X
  const hasValue = value.length > 0

  // `w-80` = a stable 320px preferred width that still shrinks (default
  // flex-shrink) when the toolbar is cramped (e.g. inspector open), so it never
  // overlaps the right cluster — the original pre-#761 behaviour. It does NOT
  // grow past 320 (no flex-1), so it doesn't jitter as the filter band changes.
  return (
    <div className="relative flex h-8 w-80 items-center">
      <SearchIcon className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className={cn("h-8 w-full pl-8", hasValue && "pr-8")}
      />
      {hasValue ? (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange("")}
          className="absolute inset-y-0 right-1.5 my-auto flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive focus-visible:ring-1 focus-visible:ring-destructive focus-visible:outline-none"
        >
          <ClearIcon className="size-4" />
        </button>
      ) : null}
    </div>
  )
}
