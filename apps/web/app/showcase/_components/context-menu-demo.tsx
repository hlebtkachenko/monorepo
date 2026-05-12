"use client"

import * as React from "react"
import {
  ContextMenu,
  ContextMenuCheckboxItem,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuRadioGroup,
  ContextMenuRadioItem,
  ContextMenuSeparator,
  ContextMenuShortcut,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import {
  Code,
  Copy,
  ExternalLink,
  FolderOpen,
  Pencil,
  Trash2,
} from "lucide-react"

export function ContextMenuDemo() {
  const [showHidden, setShowHidden] = React.useState(false)
  const [viewMode, setViewMode] = React.useState("list")

  return (
    <ContextMenu>
      <ContextMenuTrigger>
        <div className="flex h-40 w-80 items-center justify-center rounded-lg border-2 border-dashed text-sm text-muted-foreground">
          Right-click here
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56">
        <ContextMenuLabel>File actions</ContextMenuLabel>
        <ContextMenuSeparator />
        <ContextMenuItem>
          <Pencil />
          Edit
          <ContextMenuShortcut>⌘E</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          <Copy />
          Copy link
          <ContextMenuShortcut>⌘C</ContextMenuShortcut>
        </ContextMenuItem>
        <ContextMenuItem>
          <ExternalLink />
          Open in new tab
        </ContextMenuItem>
        <ContextMenuSub>
          <ContextMenuSubTrigger>
            <FolderOpen />
            Open with
          </ContextMenuSubTrigger>
          <ContextMenuSubContent>
            <ContextMenuItem>
              <Code />
              VS Code
            </ContextMenuItem>
            <ContextMenuItem>
              <Code />
              Cursor
            </ContextMenuItem>
            <ContextMenuItem>
              <Code />
              Vim
            </ContextMenuItem>
          </ContextMenuSubContent>
        </ContextMenuSub>
        <ContextMenuSeparator />
        <ContextMenuCheckboxItem
          checked={showHidden}
          onCheckedChange={setShowHidden}
        >
          Show hidden files
        </ContextMenuCheckboxItem>
        <ContextMenuSeparator />
        <ContextMenuLabel inset>View mode</ContextMenuLabel>
        <ContextMenuRadioGroup value={viewMode} onValueChange={setViewMode}>
          <ContextMenuRadioItem value="list">List</ContextMenuRadioItem>
          <ContextMenuRadioItem value="grid">Grid</ContextMenuRadioItem>
          <ContextMenuRadioItem value="columns">Columns</ContextMenuRadioItem>
        </ContextMenuRadioGroup>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive">
          <Trash2 />
          Delete
          <ContextMenuShortcut>⌫</ContextMenuShortcut>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
