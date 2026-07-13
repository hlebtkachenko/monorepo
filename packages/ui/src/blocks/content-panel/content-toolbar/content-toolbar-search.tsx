"use client"

import { Input } from "@workspace/ui/components/input"
import { useIcons } from "@workspace/ui/icon-packs"

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

  return (
    <div className="relative flex h-7 w-80 items-center">
      <SearchIcon className="pointer-events-none absolute inset-y-0 left-2.5 my-auto size-4 text-muted-foreground" />
      <Input
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-7 w-full pl-8"
      />
    </div>
  )
}
