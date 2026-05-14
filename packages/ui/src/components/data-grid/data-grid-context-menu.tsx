"use client"

import * as React from "react"
import { ClipboardIcon, CopyIcon, EraserIcon, ScissorsIcon } from "@workspace/ui/lib/icons"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import type { ContextMenuState } from "./data-grid"

interface DataGridContextMenuProps {
  contextMenu: ContextMenuState
  readOnly: boolean
  onOpenChange: (open: boolean) => void
  onCopy: () => void
  onCut: () => void
  onClear: () => void
  onPaste: () => void
}

export function DataGridContextMenu({
  contextMenu,
  readOnly,
  onOpenChange,
  onCopy,
  onCut,
  onClear,
  onPaste,
}: DataGridContextMenuProps) {
  if (!contextMenu.open) return null

  const triggerStyle: React.CSSProperties = {
    position: "fixed",
    left: `${contextMenu.x}px`,
    top: `${contextMenu.y}px`,
    width: "1px",
    height: "1px",
    padding: 0,
    margin: 0,
    border: "none",
    background: "transparent",
    pointerEvents: "none",
    opacity: 0,
  }

  return (
    <DropdownMenu open onOpenChange={onOpenChange}>
      <DropdownMenuTrigger
        style={triggerStyle}
        data-slot="data-grid-context-menu"
      />
      <DropdownMenuContent data-grid-popover="" align="start" className="w-44">
        <DropdownMenuItem onSelect={onCopy}>
          <CopyIcon />
          Copy
        </DropdownMenuItem>
        <DropdownMenuItem disabled={readOnly} onSelect={onCut}>
          <ScissorsIcon />
          Cut
        </DropdownMenuItem>
        <DropdownMenuItem disabled={readOnly} onSelect={onPaste}>
          <ClipboardIcon />
          Paste
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={readOnly} onSelect={onClear}>
          <EraserIcon />
          Clear
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
