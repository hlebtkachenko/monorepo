"use client"

import { Calculator, FileText, Settings, User } from "lucide-react"
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command"

export function CommandDemo() {
  return (
    <Command className="w-72 rounded-lg border shadow-md" shouldFilter value="">
      <CommandInput
        placeholder="Type a command or search..."
        autoFocus={false}
      />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Navigation">
          <CommandItem>
            <FileText />
            <span>Documents</span>
          </CommandItem>
          <CommandItem>
            <User />
            <span>Profile</span>
          </CommandItem>
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Tools">
          <CommandItem>
            <Calculator />
            <span>Calculator</span>
          </CommandItem>
          <CommandItem>
            <Settings />
            <span>Settings</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </Command>
  )
}
