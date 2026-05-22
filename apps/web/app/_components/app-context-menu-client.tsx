"use client"

import { useCallback } from "react"
import { usePathname } from "next/navigation"
import { toast } from "sonner"
import {
  AppContextMenu,
  type BugReportPayload,
} from "@workspace/ui/blocks/app-context-menu"

interface AppContextMenuClientProps {
  children: React.ReactNode
  orgSlug?: string
  user?: { id?: string; email?: string }
}

/**
 * Client wrapper around `@workspace/ui/blocks/app-context-menu`. Reads
 * the current pathname via Next's router and wires the Report-bug
 * action to the `/api/feedback/bug` route handler (which posts to
 * Linear). Other menu items fall back to their default clipboard
 * behavior implemented inside the UI block.
 */
export function AppContextMenuClient({
  children,
  orgSlug,
  user,
}: AppContextMenuClientProps) {
  const pathname = usePathname()

  const onReportBug = useCallback(async (payload: BugReportPayload) => {
    // Throws on failure so the BugReportDialog's submit-state machine
    // can flip to "error" and keep itself open; success path returns
    // the issue id/url for the dialog's optional use.
    const res = await fetch("/api/feedback/bug", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    })
    if (res.status === 503) {
      throw new Error(
        "Bug reports are not wired up yet — set LINEAR_API_KEY in the server env.",
      )
    }
    if (!res.ok) {
      let detail = `HTTP ${res.status}`
      try {
        const errBody = (await res.json()) as { error?: string }
        if (errBody?.error) detail += ` — ${errBody.error}`
      } catch {
        // ignore parse error; keep the status-only message.
      }
      throw new Error(`Bug report failed (${detail})`)
    }
    const data = (await res.json()) as {
      identifier?: string
      url?: string
    }
    toast.success(
      data.identifier ? `Bug reported: ${data.identifier}` : "Bug reported",
      data.url
        ? {
            action: {
              label: "Open",
              onClick: () => window.open(data.url, "_blank"),
            },
          }
        : undefined,
    )
    return data
  }, [])

  return (
    <AppContextMenu
      pathname={pathname ?? "/"}
      orgSlug={orgSlug}
      user={user}
      appConfig={{
        appName: "the Afframe accounting platform",
        repoName: "monorepo",
        framework: "Next.js 16 (App Router) + Turborepo + pnpm workspaces",
      }}
      onReportBug={onReportBug}
      onAskSidekick={(_, formatted) =>
        void navigator.clipboard
          .writeText(formatted)
          .then(() => toast.success("Sidekick prompt copied"))
          .catch(() => toast.error("Clipboard write failed"))
      }
      onAboutBlock={(_, formatted) =>
        void navigator.clipboard
          .writeText(formatted)
          .then(() => toast.success("Help search copied"))
          .catch(() => toast.error("Clipboard write failed"))
      }
      onCopyPath={(_, formatted) =>
        void navigator.clipboard
          .writeText(formatted)
          .then(() => toast.success("Agent prompt copied"))
          .catch(() => toast.error("Clipboard write failed"))
      }
    >
      {children}
    </AppContextMenu>
  )
}
