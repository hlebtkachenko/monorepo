"use client"

import * as React from "react"

import { SeparatorExtended } from "@workspace/ui/components/separator-extended"

export function SeparatorExtendedDemo() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium text-muted-foreground">Solid</span>
        <SeparatorExtended />
      </div>
      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Dashed
        </span>
        <SeparatorExtended variant="dashed" />
      </div>
      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Dotted
        </span>
        <SeparatorExtended variant="dotted" />
      </div>
      <div className="flex flex-col gap-3">
        <span className="text-xs font-medium text-muted-foreground">
          Double
        </span>
        <SeparatorExtended variant="double" />
      </div>
      <div className="flex h-16 items-center gap-4">
        <span className="text-sm">Vertical solid</span>
        <SeparatorExtended orientation="vertical" />
        <span className="text-sm text-muted-foreground">Section A</span>
        <SeparatorExtended orientation="vertical" variant="dashed" />
        <span className="text-sm text-muted-foreground">Section B</span>
        <SeparatorExtended orientation="vertical" variant="dotted" />
        <span className="text-sm text-muted-foreground">Section C</span>
      </div>
    </div>
  )
}
