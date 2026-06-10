"use client"

import { useCallback } from "react"
import { usePathname } from "next/navigation"
import { useTranslations } from "@workspace/i18n/client"
import { toast } from "@workspace/ui/components/sonner"
import {
  AppContextMenu,
  type BugReportPayload,
} from "@workspace/ui/blocks/app-context-menu"

import { reportFeedback } from "./report-feedback"

interface AppContextMenuClientProps {
  children: React.ReactNode
  orgSlug?: string
  user?: { id?: string; email?: string }
}

/**
 * Client wrapper around `@workspace/ui/blocks/app-context-menu`. Reads
 * the current pathname via Next's router and wires the Report-bug
 * action to the `reportFeedback` server action, which forwards to the
 * canonical `POST /v1/feedback` on apps/api. Other menu items fall back
 * to their default clipboard behavior implemented inside the UI block.
 */
export function AppContextMenuClient({
  children,
  orgSlug,
  user,
}: AppContextMenuClientProps) {
  const pathname = usePathname()
  const tBrand = useTranslations("brand")

  const onReportBug = useCallback(async (payload: BugReportPayload) => {
    // Forwarded to apps/api `POST /v1/feedback` via the `reportFeedback`
    // server action (same-origin RPC → server-to-server, no browser
    // CORS). Throws on failure so the BugReportDialog's submit-state
    // machine flips to "error" and keeps itself open. v1 returns an
    // opaque referenceId (no Linear issue URL), surfaced via the toast.
    const { referenceId } = await reportFeedback(payload)
    toast.success(`Feedback sent — ${referenceId}`)
  }, [])

  // The three "copy to clipboard then toast" menu actions differ only by
  // their success message, so share one handler factory.
  const copyWithToast = useCallback(
    (message: string) => (_: unknown, formatted: string) =>
      void navigator.clipboard
        .writeText(formatted)
        .then(() => toast.success(message))
        .catch(() => toast.error("Clipboard write failed")),
    [],
  )

  return (
    <AppContextMenu
      pathname={pathname ?? "/"}
      orgSlug={orgSlug}
      user={user}
      appConfig={{
        appName: `the ${tBrand("name")} accounting platform`,
        repoName: "monorepo",
        framework: "Next.js 16 (App Router) + Turborepo + pnpm workspaces",
      }}
      onReportBug={onReportBug}
      onAskSidekick={copyWithToast("Sidekick prompt copied")}
      onAboutBlock={copyWithToast("Help search copied")}
      onCopyPath={copyWithToast("Agent prompt copied")}
    >
      {children}
    </AppContextMenu>
  )
}
