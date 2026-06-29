"use client"

import { useEffect, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { Bookmark, BookmarkPlus, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Input } from "@workspace/ui/components/input"

export interface SavedView {
  name: string
  params: string
}

export interface SavedViewsProps {
  tableKey: string
  currentParams: string
}

function storageKey(tableKey: string): string {
  return `admin.savedViews.${tableKey}`
}

function readViews(tableKey: string): SavedView[] {
  if (typeof window === "undefined") return []
  try {
    const raw = window.localStorage.getItem(storageKey(tableKey))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as SavedView[]) : []
  } catch {
    return []
  }
}

function writeViews(tableKey: string, views: SavedView[]): void {
  if (typeof window === "undefined") return
  window.localStorage.setItem(storageKey(tableKey), JSON.stringify(views))
}

export function SavedViews({ tableKey, currentParams }: SavedViewsProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [views, setViews] = useState<SavedView[]>([])
  const [dialogOpen, setDialogOpen] = useState(false)
  const [name, setName] = useState("")

  useEffect(() => {
    setViews(readViews(tableKey))
  }, [tableKey])

  function save() {
    if (!name.trim()) return
    const next = [
      ...views.filter((v) => v.name !== name.trim()),
      { name: name.trim(), params: currentParams },
    ]
    writeViews(tableKey, next)
    setViews(next)
    setName("")
    setDialogOpen(false)
  }

  function remove(viewName: string) {
    const next = views.filter((v) => v.name !== viewName)
    writeViews(tableKey, next)
    setViews(next)
  }

  function apply(view: SavedView) {
    const sep = view.params.startsWith("?") ? "" : view.params ? "?" : ""
    router.push(`${pathname}${sep}${view.params}`)
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button type="button" variant="outline" size="sm">
            <Bookmark className="size-3" aria-hidden />
            Saved views ({views.length})
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="min-w-56">
          <DropdownMenuLabel>Saved views</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {views.length === 0 ? (
            <DropdownMenuItem disabled>No saved views yet</DropdownMenuItem>
          ) : (
            views.map((view) => (
              <DropdownMenuItem
                key={view.name}
                className="flex items-center justify-between gap-2"
                onSelect={(e) => {
                  e.preventDefault()
                  apply(view)
                }}
              >
                <span className="truncate">{view.name}</span>
                <button
                  type="button"
                  aria-label={`Delete ${view.name}`}
                  className="text-muted-foreground hover:text-destructive"
                  onClick={(e) => {
                    e.stopPropagation()
                    remove(view.name)
                  }}
                >
                  <Trash2 className="size-3" />
                </button>
              </DropdownMenuItem>
            ))
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={(e) => {
              e.preventDefault()
              setDialogOpen(true)
            }}
          >
            <BookmarkPlus className="size-3" aria-hidden />
            Save current view…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Save view</DialogTitle>
            <DialogDescription>
              Stored locally in your browser. Not shared across staff.
            </DialogDescription>
          </DialogHeader>
          <Input
            placeholder="My filters"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
