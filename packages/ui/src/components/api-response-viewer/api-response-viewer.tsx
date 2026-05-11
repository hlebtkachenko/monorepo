"use client"

import * as React from "react"

import { JsonViewer } from "@workspace/ui/components/json-viewer"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { cn } from "@workspace/ui/lib/utils"

type HttpStatusKind =
  | "info"
  | "success"
  | "redirect"
  | "client-error"
  | "server-error"

interface ApiResponse {
  status: number
  statusText?: string
  headers?: Record<string, string>
  body?: unknown
  timing?: {
    dns?: number
    connect?: number
    ttfb?: number
    download?: number
    total: number
  }
}

interface ApiResponseViewerProps {
  response: ApiResponse
  defaultTab?: "body" | "headers" | "timing"
  className?: string
}

function classifyStatus(status: number): HttpStatusKind {
  if (status >= 100 && status < 200) return "info"
  if (status >= 200 && status < 300) return "success"
  if (status >= 300 && status < 400) return "redirect"
  if (status >= 400 && status < 500) return "client-error"
  return "server-error"
}

const statusClasses: Record<HttpStatusKind, string> = {
  info: "bg-info/10 text-info",
  success: "bg-success/10 text-success",
  redirect: "bg-info/10 text-info",
  "client-error": "bg-warning/10 text-warning",
  "server-error": "bg-destructive/10 text-destructive",
}

function StatusBadge({
  status,
  statusText,
}: {
  status: number
  statusText?: string
}) {
  const kind = classifyStatus(status)
  return (
    <span
      role="status"
      aria-label={`HTTP status ${status}${statusText ? ` ${statusText}` : ""}`}
      className={cn(
        "rounded-md px-2 py-0.5 font-mono text-sm font-medium",
        statusClasses[kind],
      )}
    >
      {status} {statusText}
    </span>
  )
}

function HeadersTable({ headers }: { headers: Record<string, string> }) {
  return (
    <div className="overflow-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-border">
            <th className="py-2 pr-4 text-left font-medium text-muted-foreground">
              Header
            </th>
            <th className="py-2 text-left font-medium text-muted-foreground">
              Value
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(headers).map(([key, value]) => (
            <tr key={key} className="border-b border-border last:border-0">
              <td className="py-2 pr-4 font-mono text-foreground">{key}</td>
              <td className="py-2 font-mono break-all text-muted-foreground">
                {value}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const timingSegments = [
  { key: "dns" as const, label: "DNS", token: "var(--chart-1)" },
  { key: "connect" as const, label: "Connect", token: "var(--chart-2)" },
  { key: "ttfb" as const, label: "TTFB", token: "var(--chart-3)" },
  { key: "download" as const, label: "Download", token: "var(--chart-4)" },
]

function TimingBar({ timing }: { timing: NonNullable<ApiResponse["timing"]> }) {
  const segments = timingSegments
    .map((seg) => ({ ...seg, value: timing[seg.key] }))
    .filter(
      (s): s is typeof s & { value: number } => typeof s.value === "number",
    )

  return (
    <div className="space-y-4">
      <div className="flex h-6 overflow-hidden rounded-md">
        {segments.map((seg) => (
          <div
            key={seg.key}
            className="flex items-center justify-center text-xs text-foreground"
            style={{
              width: `${(seg.value / timing.total) * 100}%`,
              backgroundColor: seg.token,
            }}
          >
            {seg.value}ms
          </div>
        ))}
      </div>
      <div className="flex flex-wrap gap-4 text-sm">
        {segments.map((seg) => (
          <div key={seg.key} className="flex items-center gap-2">
            <div
              className="size-3 rounded-md"
              style={{ backgroundColor: seg.token }}
            />
            <span className="text-muted-foreground">{seg.label}:</span>
            <span className="font-mono">{seg.value}ms</span>
          </div>
        ))}
        <div className="flex items-center gap-2">
          <div className="size-3 rounded-md bg-muted-foreground" />
          <span className="text-muted-foreground">Total:</span>
          <span className="font-mono font-semibold">{timing.total}ms</span>
        </div>
      </div>
    </div>
  )
}

function ApiResponseViewer({
  response,
  defaultTab = "body",
  className,
}: ApiResponseViewerProps) {
  const tabs = (
    [
      {
        id: "body" as const,
        label: "Body",
        available: response.body !== undefined,
      },
      {
        id: "headers" as const,
        label: "Headers",
        available: !!response.headers,
      },
      { id: "timing" as const, label: "Timing", available: !!response.timing },
    ] satisfies {
      id: "body" | "headers" | "timing"
      label: string
      available: boolean
    }[]
  ).filter((t) => t.available)

  return (
    <div
      data-slot="api-response-viewer"
      className={cn(
        "overflow-hidden rounded-lg border border-border",
        className,
      )}
    >
      <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
        <StatusBadge
          status={response.status}
          {...(response.statusText !== undefined
            ? { statusText: response.statusText }
            : {})}
        />
        {response.timing && (
          <span className="font-mono text-sm text-muted-foreground">
            {response.timing.total}ms
          </span>
        )}
      </div>

      <Tabs defaultValue={defaultTab} className="gap-0">
        <TabsList
          variant="line"
          className="w-full justify-start rounded-none border-b border-border px-0"
        >
          {tabs.map((tab) => (
            <TabsTrigger key={tab.id} value={tab.id} className="px-4 py-2">
              {tab.label}
            </TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="body" className="p-4">
          {response.body !== undefined && (
            <JsonViewer
              data={response.body as Parameters<typeof JsonViewer>[0]["data"]}
            />
          )}
        </TabsContent>
        {response.headers && (
          <TabsContent value="headers" className="p-4">
            <HeadersTable headers={response.headers} />
          </TabsContent>
        )}
        {response.timing && (
          <TabsContent value="timing" className="p-4">
            <TimingBar timing={response.timing} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  )
}

export { ApiResponseViewer }
export type { ApiResponseViewerProps, ApiResponse, HttpStatusKind }
