"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { IconButton } from "@workspace/ui/components/icon-button"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemTitle,
} from "@workspace/ui/components/item"

/** Action-required reminder: title + optional description + a button. */
export interface ReminderActionItem {
  id: string
  kind: "action"
  title: string
  description?: string
  actionLabel: string
}

/**
 * Info reminder: title + optional description + a trailing open icon. The
 * icon redirects (opens `href` in a new window).
 */
export interface ReminderInfoItem {
  id: string
  kind: "info"
  title: string
  description?: string
  href?: string
}

export type SidebarReminder = ReminderActionItem | ReminderInfoItem

const STORAGE_PREFIX = "sidebar-reminders-dismissed:"

function readDismissed(storageKey: string): Set<string> {
  if (typeof window === "undefined") return new Set()
  try {
    const raw = window.localStorage.getItem(STORAGE_PREFIX + storageKey)
    return new Set(raw ? (JSON.parse(raw) as string[]) : [])
  } catch {
    return new Set()
  }
}

function persistDismissed(storageKey: string, ids: Set<string>) {
  try {
    window.localStorage.setItem(
      STORAGE_PREFIX + storageKey,
      JSON.stringify([...ids]),
    )
  } catch {
    // localStorage unavailable — dismissal just won't persist this session.
  }
}

export interface SidebarRemindersProps {
  /** Reminders the system wants to surface. Empty ⇒ nothing renders. */
  reminders: SidebarReminder[]
  /** Scopes the dismissed-set in localStorage (e.g. per org slug). */
  storageKey: string
  /**
   * Invoked when a reminder is resolved (action clicked / info opened), just
   * before it is dismissed — do the work / navigate here.
   */
  onResolve?: (reminder: SidebarReminder) => void
}

/**
 * Section 2 — the optional reminder strip. No separator of its own; it just
 * sits in the flow when present, scrolling with the nav.
 *
 * Both styles share one shape: a bold one-line title that truncates, an
 * optional two-line description that clamps (same as the nav links), no
 * leading icon, and a trailing action — a Button (action) or an open IconButton
 * (info, which redirects). Resolving marks the id dismissed in localStorage,
 * so it stays gone across reloads; no active reminders ⇒ the section is absent.
 */
export function SidebarReminders({
  reminders,
  storageKey,
  onResolve,
}: SidebarRemindersProps) {
  // Start empty so SSR + the first client render agree (the server can't see
  // localStorage). The dismissed-set is loaded in an effect AFTER hydration,
  // then re-loaded whenever the scope (storageKey) changes.
  const [dismissed, setDismissed] = React.useState<Set<string>>(() => new Set())
  React.useEffect(() => {
    setDismissed(readDismissed(storageKey))
  }, [storageKey])

  const resolve = React.useCallback(
    (reminder: SidebarReminder) => {
      onResolve?.(reminder)
      setDismissed((prev) => {
        const next = new Set(prev).add(reminder.id)
        persistDismissed(storageKey, next)
        return next
      })
    },
    [onResolve, storageKey],
  )

  const active = reminders.filter((r) => !dismissed.has(r.id))
  if (active.length === 0) return null

  return (
    <div data-slot="sidebar-reminders" className="flex flex-col gap-2">
      {active.map((reminder) => (
        <Item
          key={reminder.id}
          variant="outline"
          className="flex-nowrap items-center px-2.5 py-2 transition-colors hover:bg-accent/40"
          data-reminder-id={reminder.id}
        >
          <ItemContent className="min-w-0 gap-0.5">
            <ItemTitle className="block w-full truncate text-sm font-medium">
              {reminder.title}
            </ItemTitle>
            {reminder.description ? (
              <ItemDescription className="text-xs">
                {reminder.description}
              </ItemDescription>
            ) : null}
          </ItemContent>
          <ItemActions>
            {reminder.kind === "action" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => resolve(reminder)}
              >
                {reminder.actionLabel}
              </Button>
            ) : (
              <IconButton
                icon="ArrowUpRight"
                aria-label="Open"
                onClick={() => {
                  if (reminder.href) {
                    window.open(reminder.href, "_blank", "noopener,noreferrer")
                  }
                  resolve(reminder)
                }}
              />
            )}
          </ItemActions>
        </Item>
      ))}
    </div>
  )
}
