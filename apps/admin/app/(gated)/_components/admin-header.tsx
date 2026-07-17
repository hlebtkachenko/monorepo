"use client"

import type { ReactNode } from "react"

import { Logo } from "@workspace/ui/brand-assets"
import { AppHeader } from "@workspace/ui/blocks/app-header"
import { Separator } from "@workspace/ui/components/separator"

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
      <AppHeader
        searchPlaceholder="Search… (⌘K)"
        // Separator + wordmark sit flush to the header's left edge — same
        // lockup as the workspace shell. Admin has no colored chrome, so the
        // divider uses the `icon-active-bg` token (#cdcece light / #3a3d40 dark)
        // and the wordmark uses the adaptive `admin` tone; both are theme-aware.
        leftContent={
          <>
            <Separator
              orientation="vertical"
              inset
              className="h-5 bg-icon-active-bg"
            />
            <Logo
              variant="wordmark"
              tone="admin"
              className="h-[var(--wordmark-height)] w-auto"
            />
          </>
        }
        actions={actions}
      />
    </div>
  )
}
