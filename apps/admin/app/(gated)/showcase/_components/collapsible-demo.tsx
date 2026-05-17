"use client"

import { useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"

export function CollapsibleDemo() {
  const [isOpen, setIsOpen] = useState(false)

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen} className="w-72">
      <div className="flex items-center justify-between rounded-lg border px-3 py-2">
        <span className="text-sm font-medium">Environment Variables</span>
        <CollapsibleTrigger asChild>
          <Button variant="ghost" size="icon">
            <ChevronsUpDown className="size-4" />
            <span className="sr-only">Toggle</span>
          </Button>
        </CollapsibleTrigger>
      </div>
      <CollapsibleContent className="mt-1 space-y-1">
        <div className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
          DATABASE_URL=postgres://localhost/dev
        </div>
        <div className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
          NEXT_PUBLIC_API_URL=http://localhost:3000
        </div>
        <div className="rounded-lg border bg-muted/40 px-3 py-2 font-mono text-xs">
          NODE_ENV=development
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}
