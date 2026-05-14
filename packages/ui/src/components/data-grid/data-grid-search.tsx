"use client"

import * as React from "react"
import { ChevronDown, ChevronUp, Search, X } from "@workspace/ui/lib/icons"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"

interface DataGridSearchProps {
  searchOpen: boolean
  onSearchOpenChange: (open: boolean) => void
  searchQuery: string
  onSearchQueryChange: (query: string) => void
  matchIndex: number
  matchCount: number
  onNavigateNext: () => void
  onNavigatePrev: () => void
}

export function DataGridSearch({
  searchOpen,
  onSearchOpenChange,
  searchQuery,
  onSearchQueryChange,
  matchIndex,
  matchCount,
  onNavigateNext,
  onNavigatePrev,
}: DataGridSearchProps) {
  const inputRef = React.useRef<HTMLInputElement>(null)

  React.useEffect(() => {
    if (searchOpen) inputRef.current?.focus()
  }, [searchOpen])

  React.useEffect(() => {
    if (!searchOpen) return
    function onEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault()
        onSearchOpenChange(false)
      }
    }
    document.addEventListener("keydown", onEscape)
    return () => document.removeEventListener("keydown", onEscape)
  }, [searchOpen, onSearchOpenChange])

  if (!searchOpen) {
    return (
      <div
        data-slot="data-grid-search-toolbar"
        className="flex items-center justify-end"
      >
        <Button
          type="button"
          variant="outline"
          size="sm"
          data-slot="data-grid-search-toggle"
          className="size-7"
          onClick={() => onSearchOpenChange(true)}
          aria-label="Open search"
        >
          <Search />
        </Button>
      </div>
    )
  }

  return (
    <div
      role="search"
      data-slot="data-grid-search"
      className="flex w-full flex-wrap items-center gap-2 rounded-md border bg-background p-2 shadow-sm"
    >
      <Input
        ref={inputRef}
        value={searchQuery}
        placeholder="Find in grid..."
        className="h-8 w-64"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(event) => onSearchQueryChange(event.target.value)}
        onKeyDown={(event) => {
          event.stopPropagation()
          if (event.key === "Enter") {
            event.preventDefault()
            if (event.shiftKey) onNavigatePrev()
            else onNavigateNext()
          }
        }}
      />
      <div className="flex items-center gap-1">
        <Button
          aria-label="Previous match"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onNavigatePrev}
          disabled={matchCount === 0}
        >
          <ChevronUp />
        </Button>
        <Button
          aria-label="Next match"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={onNavigateNext}
          disabled={matchCount === 0}
        >
          <ChevronDown />
        </Button>
        <Button
          aria-label="Close search"
          variant="ghost"
          size="icon"
          className="size-7"
          onClick={() => onSearchOpenChange(false)}
        >
          <X />
        </Button>
      </div>
      <div className="ml-auto text-xs text-muted-foreground">
        {matchCount > 0
          ? `${matchIndex + 1} of ${matchCount}`
          : searchQuery
            ? "No results"
            : "Type to search"}
      </div>
    </div>
  )
}
