"use client"

import * as React from "react"
import { Loader2, Plus, Send, Trash2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import { Textarea } from "@workspace/ui/components/textarea"
import { cn } from "@workspace/ui/lib/utils"

type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE"

interface WebhookRequest {
  url: string
  method: HttpMethod
  headers: Record<string, string>
  body?: string
}

interface WebhookResponse {
  status: number
  statusText: string
  headers: Record<string, string>
  body: unknown
  timing: number
}

interface WebhookTesterProps {
  /**
   * Required handler that performs the request. No built-in fetch.
   * Caller is responsible for transport, CORS handling, auth, and any
   * server-side proxying needed to avoid browser network restrictions.
   */
  onSend: (request: WebhookRequest) => Promise<WebhookResponse>
  defaultUrl?: string
  defaultMethod?: HttpMethod
  defaultHeaders?: Record<string, string>
  defaultBody?: string
  className?: string
}

function statusClass(status: number): string {
  if (status >= 200 && status < 300) return "text-success"
  if (status >= 300 && status < 400) return "text-info"
  if (status >= 400 && status < 500) return "text-warning"
  return "text-destructive"
}

function WebhookTester({
  onSend,
  defaultUrl = "",
  defaultMethod = "POST",
  defaultHeaders = { "Content-Type": "application/json" },
  defaultBody = "{}",
  className,
}: WebhookTesterProps) {
  const [url, setUrl] = React.useState(defaultUrl)
  const [method, setMethod] = React.useState<HttpMethod>(defaultMethod)
  const [headers, setHeaders] = React.useState<
    { key: string; value: string }[]
  >(Object.entries(defaultHeaders).map(([key, value]) => ({ key, value })))
  const [body, setBody] = React.useState(defaultBody)
  const [response, setResponse] = React.useState<WebhookResponse | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const handleAddHeader = React.useCallback(() => {
    setHeaders((prev) => [...prev, { key: "", value: "" }])
  }, [])

  const handleRemoveHeader = React.useCallback((index: number) => {
    setHeaders((prev) => prev.filter((_, i) => i !== index))
  }, [])

  const handleHeaderChange = React.useCallback(
    (index: number, field: "key" | "value", value: string) => {
      setHeaders((prev) =>
        prev.map((h, i) => (i === index ? { ...h, [field]: value } : h)),
      )
    },
    [],
  )

  const handleSend = React.useCallback(async () => {
    if (!url) return

    setLoading(true)
    setError(null)
    setResponse(null)

    const headersObj = headers.reduce<Record<string, string>>(
      (acc, { key, value }) => {
        if (key) acc[key] = value
        return acc
      },
      {},
    )

    try {
      const req: WebhookRequest = {
        url,
        method,
        headers: headersObj,
        ...(method !== "GET" ? { body } : {}),
      }
      const res = await onSend(req)
      setResponse(res)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Request failed")
    } finally {
      setLoading(false)
    }
  }, [url, method, headers, body, onSend])

  return (
    <div
      data-slot="webhook-tester"
      aria-busy={loading}
      aria-label="Webhook tester"
      className={cn(
        "overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <div className="space-y-4 p-4">
        <div className="flex gap-2">
          <NativeSelect
            value={method}
            onChange={(e) => setMethod(e.target.value as HttpMethod)}
            aria-label="HTTP method"
            className="font-mono font-medium"
          >
            {(["GET", "POST", "PUT", "PATCH", "DELETE"] as HttpMethod[]).map(
              (m) => (
                <NativeSelectOption key={m} value={m}>
                  {m}
                </NativeSelectOption>
              ),
            )}
          </NativeSelect>
          <Input
            type="url"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://api.example.com/webhook"
            aria-label="Webhook URL"
            className="flex-1 font-mono"
          />
          <Button
            type="button"
            onClick={handleSend}
            disabled={loading || !url}
            aria-label={loading ? "Sending request" : "Send request"}
          >
            {loading ? <Loader2 className="animate-spin" /> : <Send />}
            Send
          </Button>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Headers</span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={handleAddHeader}
              aria-label="Add header"
            >
              <Plus />
              Add
            </Button>
          </div>
          <div className="space-y-1">
            {headers.map((header, index) => (
              <div key={index} className="flex gap-2">
                <Input
                  type="text"
                  value={header.key}
                  onChange={(e) =>
                    handleHeaderChange(index, "key", e.target.value)
                  }
                  placeholder="Header name"
                  aria-label="Header name"
                  className="flex-1 font-mono"
                />
                <Input
                  type="text"
                  value={header.value}
                  onChange={(e) =>
                    handleHeaderChange(index, "value", e.target.value)
                  }
                  placeholder="Header value"
                  aria-label={`Value for ${header.key || "header"}`}
                  className="flex-[2] font-mono"
                />
                <Button
                  type="button"
                  variant="ghost"
                  size="icon-sm"
                  onClick={() => handleRemoveHeader(index)}
                  aria-label={`Remove ${header.key || "header"}`}
                  className="text-muted-foreground hover:text-destructive"
                >
                  <Trash2 />
                </Button>
              </div>
            ))}
          </div>
        </div>

        {method !== "GET" && (
          <div className="space-y-2">
            <span className="text-sm font-medium">Body</span>
            <Textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder='{"key": "value"}'
              aria-label="Request body"
              className="h-32 resize-none font-mono"
            />
          </div>
        )}
      </div>

      {(response || error) && (
        <div className="border-t border-border">
          <div className="flex items-center justify-between bg-muted/50 px-4 py-2 text-sm font-medium">
            <span>Response</span>
            {response && (
              <div className="flex items-center gap-3 text-xs">
                <span
                  className={cn(
                    "font-mono font-bold",
                    statusClass(response.status),
                  )}
                >
                  {response.status} {response.statusText}
                </span>
                <span className="text-muted-foreground">
                  {response.timing}ms
                </span>
              </div>
            )}
          </div>
          <div className="max-h-64 overflow-auto p-4">
            {error ? (
              <div className="text-sm text-destructive">{error}</div>
            ) : response ? (
              <pre className="font-mono text-xs whitespace-pre-wrap">
                {typeof response.body === "string"
                  ? response.body
                  : JSON.stringify(response.body, null, 2)}
              </pre>
            ) : null}
          </div>
        </div>
      )}
    </div>
  )
}

export { WebhookTester }
export type { WebhookTesterProps, WebhookRequest, WebhookResponse, HttpMethod }
