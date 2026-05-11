"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  FloatingPanel,
  FloatingPanelBody,
  FloatingPanelContent,
  FloatingPanelControl,
  FloatingPanelHeader,
  FloatingPanelMaximize,
  FloatingPanelMinimize,
  FloatingPanelRestore,
  FloatingPanelTitle,
  FloatingPanelTrigger,
} from "@workspace/ui/components/floating-panel"

export function FloatingPanelDemo() {
  return (
    <FloatingPanel>
      <FloatingPanelTrigger asChild>
        <Button variant="outline">Open floating panel</Button>
      </FloatingPanelTrigger>
      <FloatingPanelContent>
        <FloatingPanelHeader>
          <FloatingPanelTitle>Quick notes</FloatingPanelTitle>
          <FloatingPanelControl>
            <FloatingPanelMinimize />
            <FloatingPanelRestore />
            <FloatingPanelMaximize />
          </FloatingPanelControl>
        </FloatingPanelHeader>
        <FloatingPanelBody>
          <p className="text-sm text-muted-foreground">
            Drag from the header to move. Resize from any edge or corner.
          </p>
          <ul className="flex flex-col gap-1.5 text-sm text-muted-foreground">
            <li>Schedule sync with accountant</li>
            <li>Review pending invoices</li>
            <li>Approve expense report</li>
            <li>Send signed contract</li>
          </ul>
        </FloatingPanelBody>
      </FloatingPanelContent>
    </FloatingPanel>
  )
}
