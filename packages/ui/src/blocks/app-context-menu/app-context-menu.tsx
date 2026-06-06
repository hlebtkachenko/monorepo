"use client"

import * as React from "react"
import { BorderBeam } from "@workspace/ui/components/border-beam"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@workspace/ui/components/context-menu"
import {
  ArrowUpRight,
  BookOpen,
  Bug,
  Copy,
  Sparkles,
} from "@workspace/ui/lib/icons"

import { BugReportDialog } from "./parts/bug-report-dialog"
import {
  buildBugReport,
  captureContext,
  formatAboutBlock,
  formatAskSidekick,
  formatCopyPath,
  type AppConfig,
  type BugReportPayload,
  type BugReportType,
  type CapturedContext,
} from "./lib/capture-context"

export type {
  AppConfig,
  BugReportPayload,
  BugReportType,
  CapturedContext,
  ElementInfo,
  PageInfo,
  SelectionInfo,
  ScopeInfo,
  ClientInfo,
  ViewportInfo,
  SurroundingInfo,
} from "./lib/capture-context"
export {
  BUG_REPORT_TYPES,
  buildBugReport,
  formatAskSidekick,
  formatAboutBlock,
  formatCopyPath,
  guessPageFile,
} from "./lib/capture-context"

export interface AppContextMenuProps {
  pathname: string
  user?: { id?: string; email?: string }
  orgSlug?: string
  /**
   * App identity passed into the clipboard formatters — controls the
   * brand name in the Sidekick preamble, the repo name + working
   * directory in the Copy-path payload, and the page-file resolver.
   * Omit for sane generic defaults (no developer-machine paths leaked).
   */
  appConfig?: AppConfig
  /**
   * Submit a bug. Receives the full structured payload and should
   * return the created issue URL/identifier when known. Resolving
   * triggers the dialog's success animation; rejecting triggers the
   * error state and keeps the dialog open.
   */
  onReportBug?: (
    payload: BugReportPayload,
  ) => Promise<{ url?: string; identifier?: string } | void>
  /** Override the default clipboard write for Ask Sidekick. */
  onAskSidekick?: (ctx: CapturedContext, formatted: string) => void
  /** Override the default clipboard write for About this block. */
  onAboutBlock?: (ctx: CapturedContext, formatted: string) => void
  /** Override the default clipboard write for Copy path. */
  onCopyPath?: (ctx: CapturedContext, formatted: string) => void
  children: React.ReactNode
}

/**
 * Right-click context menu wrapping the entire app body. Captures the
 * clicked element + current selection + pathname and exposes four
 * actions:
 *
 *   - Ask Sidekick     copy AI-ready prompt + JSON context to clipboard
 *                      (placeholder until the Sidekick assistant ships)
 *   - About this block copy docs search payload to clipboard (will
 *                      eventually open the in-app help center in a new
 *                      tab — hence the trailing external-link icon)
 *   - Report bug       opens a dialog (type + comment) then POSTs the
 *                      payload via `onReportBug` (typically `/api/feedback/bug`)
 *   - Copy path        copy an agent-ready prompt with repo + URL + DOM
 *                      context to paste into Claude Code / Cursor
 *
 * Holding Shift while right-clicking bypasses the custom menu and
 * yields the native browser menu — keep this so power users can still
 * "Inspect Element" or "Search Google for X".
 */
export function AppContextMenu({
  pathname,
  user,
  orgSlug,
  appConfig,
  onReportBug,
  onAskSidekick,
  onAboutBlock,
  onCopyPath,
  children,
}: AppContextMenuProps) {
  const lastRef = React.useRef<{
    target: HTMLElement | null
    selection: string | null
  }>({ target: null, selection: null })
  const [bypass, setBypass] = React.useState(false)
  const [bugDialogOpen, setBugDialogOpen] = React.useState(false)
  const [bugContext, setBugContext] = React.useState<CapturedContext | null>(
    null,
  )

  function onContextMenuCapture(event: React.MouseEvent<HTMLDivElement>) {
    // Shift + right-click → browser default. We capture nothing and
    // let Radix's trigger skip when `disabled` is true on next render
    // (we toggle a one-shot bypass flag).
    if (event.shiftKey) {
      setBypass(true)
      requestAnimationFrame(() => setBypass(false))
      return
    }
    lastRef.current = {
      target: event.target as HTMLElement,
      selection: window.getSelection()?.toString() || null,
    }
  }

  function read(): CapturedContext {
    return captureContext({
      target: lastRef.current.target,
      selectionText: lastRef.current.selection,
      pathname,
      user,
      orgSlug,
    })
  }

  async function copy(text: string): Promise<boolean> {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch (err) {
      console.warn("[AppContextMenu] clipboard write failed", err)
      return false
    }
  }

  async function handleAskSidekick() {
    const ctx = read()
    const formatted = formatAskSidekick(ctx, appConfig)
    if (onAskSidekick) onAskSidekick(ctx, formatted)
    else await copy(formatted)
  }

  async function handleAboutBlock() {
    const ctx = read()
    const formatted = formatAboutBlock(ctx, appConfig)
    if (onAboutBlock) onAboutBlock(ctx, formatted)
    else await copy(formatted)
  }

  async function handleCopyPath() {
    const ctx = read()
    const formatted = formatCopyPath(ctx, appConfig)
    if (onCopyPath) onCopyPath(ctx, formatted)
    else await copy(formatted)
  }

  function handleReportBugClick() {
    setBugContext(read())
    setBugDialogOpen(true)
  }

  async function submitBug(input: {
    type: BugReportType
    message: string
    email: string | null
    context: CapturedContext
  }) {
    const payload = buildBugReport({
      ctx: input.context,
      type: input.type,
      message: input.message,
      email: input.email,
    })
    if (!onReportBug) {
      // No handler wired — best we can do is dump the JSON to
      // clipboard so the user still has something to send manually.
      await copy(JSON.stringify(payload, null, 2))
      return
    }
    await onReportBug(payload)
  }

  return (
    <>
      <ContextMenu>
        <ContextMenuTrigger asChild disabled={bypass}>
          <div
            data-slot="app-context-menu-trigger"
            className="min-h-svh"
            onContextMenuCapture={onContextMenuCapture}
          >
            {children}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="w-48 p-2 [&_[data-slot=context-menu-item]]:gap-2 [&_[data-slot=context-menu-item]]:px-2 [&_[data-slot=context-menu-item]]:py-1.5 [&_[data-slot=context-menu-label]]:px-2 [&_[data-slot=context-menu-separator]]:-mx-2 [&_[data-slot=context-menu-separator]]:my-2">
          <BorderBeam size="md" borderRadius={6} className="block rounded-md">
            <ContextMenuItem
              onSelect={() => void handleAskSidekick()}
              data-slot="app-context-menu-ask-sidekick"
              className="border border-input bg-background hover:bg-accent"
            >
              <Sparkles />
              Ask Sidekick
            </ContextMenuItem>
          </BorderBeam>
          <ContextMenuItem onSelect={() => void handleAboutBlock()}>
            <BookOpen />
            About this block
            <ArrowUpRight
              aria-hidden="true"
              className="ml-auto size-3 text-muted-foreground"
            />
          </ContextMenuItem>
          <ContextMenuSeparator />
          <ContextMenuLabel className="text-muted-foreground">
            Feedback Tools
          </ContextMenuLabel>
          <ContextMenuItem onSelect={() => handleReportBugClick()}>
            <Bug />
            Report bug
          </ContextMenuItem>
          <ContextMenuItem onSelect={() => void handleCopyPath()}>
            <Copy />
            Copy path
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      <BugReportDialog
        open={bugDialogOpen}
        onOpenChange={setBugDialogOpen}
        context={bugContext}
        defaultEmail={user?.email ?? null}
        onSubmit={submitBug}
      />
    </>
  )
}
