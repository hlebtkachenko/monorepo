"use client"

import type { ReactNode } from "react"

import { AppHeader } from "@workspace/ui/blocks/app-header"

/**
 * AppHeader for the admin surface. The block ships a centered, presentational
 * search input; admin navigates through the command palette, so focusing that
 * input (click or tab) opens the palette instead and immediately blurs — the
 * input never holds a dead caret. ⌘K and the header's command button open the
 * same palette.
 */
export function AdminHeader({ actions }: { actions: ReactNode }) {
  return (
    <div
      onFocusCapture={(e) => {
        const el = e.target as HTMLElement
        if (el instanceof HTMLInputElement && el.type === "search") {
          el.blur()
          window.dispatchEvent(new CustomEvent("admin:open-cmdk"))
        }
      }}
      className="size-full"
    >
      <AppHeader searchPlaceholder="Search… (⌘K)" actions={actions} />
    </div>
  )
}
