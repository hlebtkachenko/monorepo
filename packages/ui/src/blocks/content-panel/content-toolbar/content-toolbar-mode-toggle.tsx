"use client"

import { SquareMousePointer } from "@workspace/ui/lib/icons"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@workspace/ui/components/toggle-group"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useIcons } from "@workspace/ui/icon-packs"

import type { InspectorMode } from "../inspector"
import type { ModeToggleDescriptor } from "./toolbar-descriptors"

/**
 * ContentToolbar modeToggle slot (right #4) — the Inspector view switch
 * (panel vs dialog), bound to the descriptor's `value` / `onChange`. Repackages
 * the reference toolbar's tooltip-wrapped `ToggleGroup` behind the closed
 * descriptor vocabulary. `SquareMousePointer` is not part of the closed
 * IconName union, so it stays a direct `lib/icons` import; the dialog glyph
 * resolves by name through `useIcons()`.
 */
export function ContentToolbarModeToggle({
  value,
  onChange,
  tooltip,
}: ModeToggleDescriptor) {
  const icons = useIcons()
  const DialogIcon = icons.Maximize2

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <ToggleGroup
            type="single"
            value={value}
            onValueChange={(next) => {
              if (next) onChange(next as InspectorMode)
            }}
            variant="outline"
            size="sm"
            // Extra left margin = double the toolbar gap between the preceding
            // group and the Inspector view switch.
            className="ms-1"
          >
            <ToggleGroupItem value="panel" aria-label="Inspector as panel">
              <SquareMousePointer />
            </ToggleGroupItem>
            <ToggleGroupItem value="dialog" aria-label="Inspector as dialog">
              <DialogIcon />
            </ToggleGroupItem>
          </ToggleGroup>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {tooltip ?? "Inspector view — panel or dialog"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
