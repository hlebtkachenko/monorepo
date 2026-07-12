"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
} from "@workspace/ui/blocks/content-panel"
import { Avatar, AvatarFallback } from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { AppPageHeader } from "../../app-page-header"
import { AUDIT_MESSAGES, formatDate, type AuditMessage } from "./data"

/**
 * Audit → Messages. The thread with the Afframe audit team: date-separator
 * chips, "You" bubbles right-aligned/tinted vs "Afframe" left/muted with sender
 * initials, an unread divider, and a WORKING composer that appends the typed
 * message to local state. All messages are marked read on mount. Title
 * "Messages"; no body `<h1>`.
 */
export function AuditMessages() {
  const icons = useIcons()

  // Seed from the fixtures, then mark every message read on mount (opening the
  // thread clears the unread state, like any chat).
  const [messages, setMessages] = React.useState<AuditMessage[]>(AUDIT_MESSAGES)
  const [draft, setDraft] = React.useState("")

  // Index of the first unread message, computed BEFORE the mount effect flips
  // them, so the "New" divider shows where the user left off this session.
  const firstUnreadIndex = React.useMemo(
    () => AUDIT_MESSAGES.findIndex((m) => !m.read),
    [],
  )

  React.useEffect(() => {
    setMessages((prev) =>
      prev.some((m) => !m.read)
        ? prev.map((m) => (m.read ? m : { ...m, read: true }))
        : prev,
    )
  }, [])

  const send = () => {
    const body = draft.trim()
    if (!body) return
    setMessages((prev) => [
      ...prev,
      {
        id: `aud-msg-local-${prev.length + 1}`,
        from: "You",
        author: "You",
        body,
        date: "2026-07-02T12:00:00.000Z",
        read: true,
      },
    ])
    setDraft("")
  }

  const statusBar = (
    <ContentStatusBar
      left={<span>Communicate with the Afframe audit team</span>}
      right={<span>{messages.length} messages</span>}
    />
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader title="Messages" />
      </AppPageHeader>
      <ContentPanel statusBar={statusBar}>
        <div className="mx-auto flex h-full max-w-3xl flex-col gap-4">
          <div className="flex flex-1 flex-col gap-3">
            {messages.map((message, i) => (
              <React.Fragment key={message.id}>
                <DateSeparator
                  date={message.date}
                  prevDate={messages[i - 1]?.date}
                />
                {i === firstUnreadIndex && firstUnreadIndex > 0 ? (
                  <UnreadDivider />
                ) : null}
                <MessageRow message={message} />
              </React.Fragment>
            ))}
          </div>
          <form
            className="flex items-center gap-2 border-t border-border-subtle pt-4"
            onSubmit={(event) => {
              event.preventDefault()
              send()
            }}
          >
            <Input
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              placeholder="Message the Afframe audit team…"
            />
            <Button type="submit" disabled={draft.trim() === ""}>
              <icons.Send />
              Send
            </Button>
          </form>
        </div>
      </ContentPanel>
    </>
  )
}

/** A centered date chip, shown when the day changes from the previous message. */
function DateSeparator({
  date,
  prevDate,
}: {
  date: string
  prevDate?: string
}) {
  const day = date.slice(0, 10)
  const prevDay = prevDate?.slice(0, 10)
  if (prevDay === day) return null
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-muted px-3 py-1 text-xs text-muted-foreground">
        {formatDate(date)}
      </span>
    </div>
  )
}

function UnreadDivider() {
  return (
    <div className="flex items-center gap-2">
      <span className="h-px flex-1 bg-primary/40" />
      <span className="text-xs font-medium text-primary">New</span>
      <span className="h-px flex-1 bg-primary/40" />
    </div>
  )
}

function initials(author: string): string {
  const name = author.split("·")[0]!.trim()
  const parts = name.split(/\s+/).filter(Boolean)
  const first = parts[0]?.[0] ?? ""
  const second = parts[1]?.[0] ?? ""
  return (first + second).toUpperCase() || "?"
}

function MessageRow({ message }: { message: AuditMessage }) {
  const mine = message.from === "You"
  return (
    <div
      className={cn(
        "flex items-end gap-2",
        mine ? "flex-row-reverse" : "flex-row",
      )}
    >
      <Avatar className="size-7 shrink-0">
        <AvatarFallback className="text-xs">
          {initials(message.author)}
        </AvatarFallback>
      </Avatar>
      <div className={cn("flex min-w-0 flex-col gap-1", mine && "items-end")}>
        <div className="px-1 text-xs text-muted-foreground">
          {message.author} · {formatDate(message.date)}
        </div>
        <div
          className={cn(
            "max-w-[36rem] rounded-xl px-3 py-2 text-sm",
            mine
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-foreground",
          )}
        >
          {message.body}
        </div>
      </div>
    </div>
  )
}
