"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import type { PasteDialogState } from "./data-grid"

interface DataGridPasteDialogProps {
  pasteDialog: PasteDialogState
  onOpenChange: (open: boolean) => void
  onConfirm: (expand: boolean) => void
}

export function DataGridPasteDialog({
  pasteDialog,
  onOpenChange,
  onConfirm,
}: DataGridPasteDialogProps) {
  const [expand, setExpand] = React.useState(true)
  const nameId = React.useId()

  if (!pasteDialog.open) return null

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent data-slot="data-grid-paste-dialog" data-grid-popover="">
        <DialogHeader>
          <DialogTitle>Paste from clipboard</DialogTitle>
          <DialogDescription>
            Choose how to apply clipboard contents starting at the focused cell.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name={nameId}
              checked={expand}
              onChange={() => setExpand(true)}
              className="mt-1 size-4 accent-primary"
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm leading-none font-medium">
                Create new rows
              </span>
              <span className="text-sm text-muted-foreground">
                Add rows if needed and paste all clipboard data
              </span>
            </div>
          </label>
          <label className="flex cursor-pointer items-start gap-3">
            <input
              type="radio"
              name={nameId}
              checked={!expand}
              onChange={() => setExpand(false)}
              className="mt-1 size-4 accent-primary"
            />
            <div className="flex flex-col gap-1">
              <span className="text-sm leading-none font-medium">
                Keep current rows
              </span>
              <span className="text-sm text-muted-foreground">
                Paste only what fits in the existing rows
              </span>
            </div>
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => onConfirm(expand)}>Paste</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
