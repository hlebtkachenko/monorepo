"use client"

import { SearchIcon } from "lucide-react"

import {
  Autocomplete,
  AutocompleteEmpty,
  AutocompleteInput,
  AutocompleteItem,
  AutocompleteList,
  AutocompletePopup,
} from "@workspace/ui/components/autocomplete"

const FRAMEWORKS = [
  "Next.js",
  "Remix",
  "Astro",
  "Nuxt",
  "SvelteKit",
  "Gatsby",
  "Angular",
  "SolidStart",
]

export function AutocompleteDemo() {
  return (
    <div className="w-full max-w-sm">
      <Autocomplete items={FRAMEWORKS} mode="list" openOnInputClick>
        <AutocompleteInput
          placeholder="Search frameworks..."
          showClear
          startAddon={<SearchIcon />}
        />
        <AutocompletePopup>
          <AutocompleteList>
            {(fw: string) => (
              <AutocompleteItem key={fw} value={fw}>
                {fw}
              </AutocompleteItem>
            )}
          </AutocompleteList>
          <AutocompleteEmpty>No frameworks found.</AutocompleteEmpty>
        </AutocompletePopup>
      </Autocomplete>
    </div>
  )
}
