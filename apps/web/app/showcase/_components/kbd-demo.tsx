"use client"

import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import { Button } from "@workspace/ui/components/button"

export function KbdDemo() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
          Single key
        </h4>
        <Kbd>⌘</Kbd>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
          Modifier group
        </h4>
        <KbdGroup>
          <Kbd>⌘</Kbd>
          <Kbd>K</Kbd>
        </KbdGroup>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
          Modifier symbols
        </h4>
        <div className="flex flex-wrap items-center gap-2">
          <Kbd>⌘</Kbd>
          <Kbd>⇧</Kbd>
          <Kbd>⌥</Kbd>
          <Kbd>⌃</Kbd>
        </div>
      </div>

      <div>
        <h4 className="mb-2 text-xs font-medium text-muted-foreground">
          Inside a button
        </h4>
        <Button variant="outline">
          Search
          <KbdGroup>
            <Kbd>⌘</Kbd>
            <Kbd>K</Kbd>
          </KbdGroup>
        </Button>
      </div>
    </div>
  )
}
