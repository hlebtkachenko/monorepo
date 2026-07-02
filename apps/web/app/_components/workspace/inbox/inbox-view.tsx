"use client"

import * as React from "react"

import {
  ContentHeader,
  ContentPanel,
  ContentStatusBar,
  ContentToolbar,
  type ContentTab,
} from "@workspace/ui/blocks/app-content"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

import { AppPageHeader } from "../../app-page-header"
import { PageHeaderActions } from "../../_shared/content-header-extras"
import {
  formatDate,
  INBOX_MESSAGES,
  INBOX_TABS,
  INBOX_TYPE_META,
  type InboxMessage,
} from "./data"

/**
 * Inbox — the workspace-level feed of notifications, invites, and system
 * messages. The list archetype done the simple way: a plain `<Table>` inside a
 * `ContentPanel`, NOT `useDataTable`/`DataGridView` (that machinery is reserved
 * for the Clients list). All rows are MOCK; `read` is client-only local state,
 * so clicking a row (or "Mark all read") mutates the session view without a
 * backend. The title + tabs live in the portaled `ContentHeader`; there is no
 * body `<h1>`.
 */
export function InboxView() {
  const icons = useIcons()
  const [activeTab, setActiveTab] = React.useState("all")
  const [read, setRead] = React.useState<ReadonlySet<string>>(
    () => new Set(INBOX_MESSAGES.filter((m) => m.read).map((m) => m.id)),
  )

  const isRead = React.useCallback((id: string) => read.has(id), [read])

  const unreadCount = INBOX_MESSAGES.reduce(
    (n, m) => (read.has(m.id) ? n : n + 1),
    0,
  )

  const shown =
    activeTab === "unread"
      ? INBOX_MESSAGES.filter((m) => !read.has(m.id))
      : INBOX_MESSAGES

  const toggleRead = (id: string) => {
    setRead((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const markAllRead = () => {
    setRead(new Set(INBOX_MESSAGES.map((m) => m.id)))
  }

  const tabs: ContentTab[] = INBOX_TABS.map((tab) => ({
    value: tab.value,
    label: tab.label,
    badge: tab.value === "unread" && unreadCount > 0 ? unreadCount : undefined,
  }))

  const toolbar = (
    <ContentToolbar
      right={
        <Button
          variant="ghost"
          size="sm"
          onClick={markAllRead}
          disabled={unreadCount === 0}
        >
          <icons.Check />
          Mark all read
        </Button>
      }
    />
  )

  const statusBar = (
    <ContentStatusBar
      left={
        <span>
          {shown.length} {shown.length === 1 ? "message" : "messages"}
        </span>
      }
      right={<span>{unreadCount} unread</span>}
    />
  )

  return (
    <>
      <AppPageHeader>
        <ContentHeader
          title="All messages"
          tabs={tabs}
          value={activeTab}
          onValueChange={setActiveTab}
          actions={<PageHeaderActions />}
        />
      </AppPageHeader>
      <ContentPanel
        bodyClassName="flex min-h-0 flex-col p-0"
        toolbar={toolbar}
        statusBar={statusBar}
      >
        <div className="min-h-0 flex-1 overflow-auto [&_[data-slot=table-container]]:overflow-visible">
          <Table>
            <TableHeader className="sticky top-0 z-10 bg-muted">
              <TableRow className="hover:bg-transparent">
                <TableHead>Type</TableHead>
                <TableHead>Subject</TableHead>
                <TableHead>From</TableHead>
                <TableHead className="text-right">Date</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {shown.map((message) => (
                <InboxRow
                  key={message.id}
                  message={message}
                  read={isRead(message.id)}
                  onToggle={() => toggleRead(message.id)}
                />
              ))}
            </TableBody>
          </Table>
        </div>
      </ContentPanel>
    </>
  )
}

/** A single feed row. Unread rows are emphasized (dot + medium subject). */
function InboxRow({
  message,
  read,
  onToggle,
}: {
  message: InboxMessage
  read: boolean
  onToggle: () => void
}) {
  const icons = useIcons()
  const meta = INBOX_TYPE_META[message.type]
  const TypeIcon = icons[meta.icon]

  return (
    <TableRow
      onClick={onToggle}
      className={cn("cursor-pointer", read && "text-muted-foreground")}
    >
      <TableCell>
        <Badge variant={meta.badgeVariant}>
          <TypeIcon />
          {message.type}
        </Badge>
      </TableCell>
      <TableCell className="max-w-md whitespace-normal">
        <div className="flex items-start gap-2">
          <span
            aria-hidden
            className={cn(
              "mt-1.5 size-2 shrink-0 rounded-full",
              read ? "bg-transparent" : "bg-primary",
            )}
          />
          <div className="min-w-0">
            <div
              className={cn(
                "truncate",
                read ? "font-normal" : "font-medium text-foreground",
              )}
            >
              {message.subject}
            </div>
            <div className="truncate text-xs text-muted-foreground">
              {message.preview}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell>{message.from}</TableCell>
      <TableCell className="text-right tabular-nums">
        {formatDate(message.date)}
      </TableCell>
    </TableRow>
  )
}
