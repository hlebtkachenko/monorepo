"use client"

import { useState } from "react"
import { Bug, Check, Loader2 } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

type ReportState = "idle" | "sending" | "sent" | "failed"

export interface ErrorReportPayload {
  message: string
  digest: string | null
  stack: string | null
  componentStack?: string | null
  pathname: string
  url: string
  userAgent?: string
  buildSha?: string
  occurredAt: string
  extra?: Record<string, unknown>
}

export interface ErrorReportButtonProps {
  payload: ErrorReportPayload
}

export function ErrorReportButton({ payload }: ErrorReportButtonProps) {
  const [state, setState] = useState<ReportState>("idle")
  const [error, setError] = useState<string | null>(null)

  async function send() {
    setState("sending")
    setError(null)
    try {
      const res = await fetch("/api/admin/error-report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string
        } | null
        throw new Error(data?.error ?? `HTTP ${res.status}`)
      }
      setState("sent")
    } catch (err) {
      setError(err instanceof Error ? err.message : "unknown error")
      setState("failed")
    }
  }

  if (state === "sent") {
    return (
      <Button type="button" variant="outline" disabled className="gap-2">
        <Check className="size-4 text-green-600" aria-hidden />
        Reported
      </Button>
    )
  }

  if (state === "sending") {
    return (
      <Button type="button" variant="outline" disabled className="gap-2">
        <Loader2 className="size-4 animate-spin" aria-hidden />
        Sending…
      </Button>
    )
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        type="button"
        variant="outline"
        onClick={() => void send()}
        className="gap-2"
      >
        <Bug className="size-4" aria-hidden />
        {state === "failed" ? "Retry report" : "Report this error"}
      </Button>
      {state === "failed" && error ? (
        <span className="text-xs text-destructive">{error}</span>
      ) : null}
    </div>
  )
}
