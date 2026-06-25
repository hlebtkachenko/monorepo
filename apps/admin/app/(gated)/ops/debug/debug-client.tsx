"use client"

import { useCallback, useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Text } from "@workspace/ui/components/text"

import { fetchOutboxAction, type OutboxMessage } from "./actions"

/** Dev debug tools, lifted out of the old dev dashboard: outbox + preview. */
export function DebugClient({ webBaseUrl }: { webBaseUrl: string }) {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <PreviewSection webBaseUrl={webBaseUrl} />
      <OutboxSection webBaseUrl={webBaseUrl} />
    </div>
  )
}

function PreviewSection({ webBaseUrl }: { webBaseUrl: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dev preview mode</CardTitle>
        <Text variant="small" className="text-muted-foreground">
          When ON, the web app renders auth + onboarding pages without real
          session / signup / invite tokens. Dead-coded in production builds.
        </Text>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button asChild>
          <a
            href={`${webBaseUrl}/api/dev/preview?on=1&to=/`}
            target="_blank"
            rel="noreferrer"
          >
            Turn ON
          </a>
        </Button>
        <Button asChild variant="outline">
          <a
            href={`${webBaseUrl}/api/dev/preview?off=1&to=/`}
            target="_blank"
            rel="noreferrer"
          >
            Turn OFF
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}

function OutboxSection({ webBaseUrl }: { webBaseUrl: string }) {
  const [messages, setMessages] = useState<OutboxMessage[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      setMessages(await fetchOutboxAction())
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const id = setInterval(() => void refresh(), 5000)
    return () => clearInterval(id)
  }, [refresh])

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-3">
          <CardTitle>Email outbox</CardTitle>
          <div className="flex items-center gap-2">
            <Button onClick={() => void refresh()} variant="outline" size="sm">
              {loading ? "Refreshing…" : "Refresh"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <a
                href={`${webBaseUrl}/api/dev/outbox`}
                target="_blank"
                rel="noreferrer"
              >
                Raw JSON
              </a>
            </Button>
          </div>
        </div>
        <Text variant="small" className="text-muted-foreground">
          Live tail of the dev email transport. Auto-refreshes every 5s.
        </Text>
      </CardHeader>
      <CardContent>
        {messages.length === 0 ? (
          <Text variant="muted">
            Outbox is empty. Trigger an email (signup, reset, invite) to
            populate it.
          </Text>
        ) : (
          <ul className="flex flex-col gap-3">
            {messages.map((m, i) => (
              <OutboxItem key={`${m.at}-${i}`} message={m} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function OutboxItem({ message }: { message: OutboxMessage }) {
  const [open, setOpen] = useState(false)
  const dt = new Date(message.at)
  return (
    <li className="rounded-lg border border-input">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full flex-col gap-1 px-3 py-2 text-left transition-colors hover:bg-muted/40"
      >
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm font-medium">{message.subject}</span>
          <span className="text-xs text-muted-foreground">
            {dt.toLocaleTimeString()}
          </span>
        </div>
        <span className="text-xs text-muted-foreground">
          {message.from} → {message.to}
        </span>
      </button>
      {open && (
        <div className="flex flex-col gap-2 border-t border-input bg-muted/20 px-3 py-2">
          {message.url && (
            <a
              href={message.url}
              target="_blank"
              rel="noreferrer"
              className="text-sm font-medium underline-offset-4 hover:underline"
            >
              Open link
            </a>
          )}
          {message.text && (
            <pre className="max-h-72 overflow-auto rounded-md bg-background p-3 text-xs whitespace-pre-wrap">
              {message.text}
            </pre>
          )}
        </div>
      )}
    </li>
  )
}
