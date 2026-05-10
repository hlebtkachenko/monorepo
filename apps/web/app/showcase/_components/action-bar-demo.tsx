"use client"

import { useState } from "react"
import { CopyIcon, PencilIcon, TrashIcon, XIcon } from "lucide-react"
import { Checkbox } from "@workspace/ui/components/checkbox"
import {
  ActionBar,
  ActionBarClose,
  ActionBarGroup,
  ActionBarItem,
  ActionBarSelection,
  ActionBarSeparator,
} from "@workspace/ui/components/action-bar"

const TASKS = [
  { id: "1", title: "Update user dashboard layout", status: "In Progress" },
  { id: "2", title: "Fix authentication timeout bug", status: "Todo" },
  { id: "3", title: "Add export to CSV feature", status: "Done" },
  { id: "4", title: "Review pull request #482", status: "In Progress" },
]

export function ActionBarDemo() {
  const [selected, setSelected] = useState<Set<string>>(new Set())

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="w-full space-y-2">
      <div className="rounded-lg border border-border">
        <div className="border-b border-border px-4 py-2">
          <p className="text-sm font-medium text-muted-foreground">Tasks</p>
        </div>
        {TASKS.map((task) => (
          <label
            key={task.id}
            className="flex cursor-pointer items-center gap-3 border-b border-border px-4 py-3 last:border-b-0 hover:bg-muted/50"
          >
            <Checkbox
              checked={selected.has(task.id)}
              onCheckedChange={() => toggle(task.id)}
            />
            <span className="flex-1 text-sm">{task.title}</span>
            <span className="text-xs text-muted-foreground">{task.status}</span>
          </label>
        ))}
      </div>
      <p className="text-center text-xs text-muted-foreground">
        Select rows to see the action bar
      </p>
      <ActionBar
        open={selected.size > 0}
        onOpenChange={() => setSelected(new Set())}
      >
        <ActionBarGroup>
          <ActionBarSelection>
            {selected.size} selected
            <ActionBarSeparator />
          </ActionBarSelection>
          <ActionBarItem onSelect={() => setSelected(new Set())}>
            <CopyIcon />
            Copy
          </ActionBarItem>
          <ActionBarItem onSelect={() => setSelected(new Set())}>
            <PencilIcon />
            Edit
          </ActionBarItem>
          <ActionBarSeparator />
          <ActionBarItem
            variant="destructive"
            onSelect={() => setSelected(new Set())}
          >
            <TrashIcon />
            Delete
          </ActionBarItem>
          <ActionBarSeparator />
          <ActionBarClose>
            <XIcon />
          </ActionBarClose>
        </ActionBarGroup>
      </ActionBar>
    </div>
  )
}
