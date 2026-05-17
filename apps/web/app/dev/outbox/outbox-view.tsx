"use client"

import { useCallback, useEffect, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"

interface OutboxMessage {
  at: string
  to: string
  from: string
  subject: string
  text?: string
  html?: string
  url?: string
}

export function OutboxView() {
  const [messages, setMessages] = useState<OutboxMessage[]>([])
  const [loading, setLoading] = useState(false)
  const [autoRefresh, setAutoRefresh] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch("/api/dev/outbox", { cache: "no-store" })
      if (res.ok) {
        const data = (await res.json()) as { messages?: OutboxMessage[] }
        setMessages(data.messages ?? [])
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refresh()
    if (!autoRefresh) return
    const id = setInterval(refresh, 5000)
    return () => clearInterval(id)
  }, [refresh, autoRefresh])

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6 px-6 py-10">
      <header className="flex flex-col gap-2">
        <Heading level={1} className="mt-0">
          Email outbox
        </Heading>
        <Text variant="muted">
          Dev-only ring buffer of every email the console transport "sent". Use
          to grab password-reset / magic-link / invite URLs without scraping
          stdout.
        </Text>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <Button onClick={refresh} variant="outline" size="sm">
          {loading ? "Refreshing…" : "Refresh"}
        </Button>
        <Button
          variant={autoRefresh ? "default" : "outline"}
          size="sm"
          onClick={() => setAutoRefresh((v) => !v)}
        >
          Auto-refresh: {autoRefresh ? "on" : "off"}
        </Button>
        <Button asChild variant="outline" size="sm">
          <a href="/api/dev/outbox" target="_blank" rel="noreferrer">
            Raw JSON
          </a>
        </Button>
        <Text variant="small" className="ml-auto text-muted-foreground">
          {messages.length} message{messages.length === 1 ? "" : "s"}
        </Text>
      </div>

      {messages.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Text variant="muted">
              Outbox is empty. Trigger an email (signup link, reset password,
              magic link, invite) and it will appear here.
            </Text>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-3">
          {messages.map((m, i) => (
            <OutboxItem key={`${m.at}-${i}`} message={m} />
          ))}
        </ul>
      )}
    </div>
  )
}

function OutboxItem({ message }: { message: OutboxMessage }) {
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const dt = new Date(message.at)

  return (
    <li>
      <Card>
        <CardHeader
          className="cursor-pointer"
          onClick={() => setOpen((o) => !o)}
        >
          <div className="flex items-baseline justify-between gap-3">
            <CardTitle className="text-base">{message.subject}</CardTitle>
            <span className="text-xs text-muted-foreground">
              {dt.toLocaleString()}
            </span>
          </div>
          <Text variant="small" className="text-muted-foreground">
            {message.from} → {message.to}
          </Text>
        </CardHeader>

        {open && (
          <CardContent className="flex flex-col gap-3">
            {message.url && (
              <div className="flex items-center justify-between gap-3 rounded-md bg-muted/40 p-3">
                <a
                  href={message.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium break-all underline-offset-4 hover:underline"
                >
                  {message.url}
                </a>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={async () => {
                    await navigator.clipboard.writeText(message.url!)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 1500)
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
            )}
            {message.text && (
              <pre className="max-h-96 overflow-auto rounded-md border border-input bg-background p-3 text-xs whitespace-pre-wrap">
                {message.text}
              </pre>
            )}
            {message.html && (
              <details className="rounded-md border border-input bg-background p-3">
                <summary className="cursor-pointer text-sm font-medium">
                  HTML preview
                </summary>
                <iframe
                  className="mt-2 h-96 w-full rounded-md border border-input"
                  srcDoc={message.html}
                  title={`${message.subject} HTML preview`}
                  sandbox=""
                />
              </details>
            )}
          </CardContent>
        )}
      </Card>
    </li>
  )
}
