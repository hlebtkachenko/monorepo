"use client"

import { useEffect, useMemo } from "react"
import { AlertTriangle } from "lucide-react"

import { Button } from "@workspace/ui/components/button"

import { ErrorReportButton } from "./_components/error-report-button"

export default function GatedError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    if (typeof window !== "undefined") {
      console.error("[admin] gated error boundary captured", error)
    }
  }, [error])

  const payload = useMemo(
    () => ({
      message: error.message || "Unknown error",
      digest: error.digest ?? null,
      stack: error.stack ?? null,
      componentStack: null,
      pathname: typeof window !== "undefined" ? window.location.pathname : "/",
      url: typeof window !== "undefined" ? window.location.href : "",
      userAgent:
        typeof navigator !== "undefined" ? navigator.userAgent : undefined,
      buildSha: process.env.NEXT_PUBLIC_BUILD_SHA ?? "unknown",
      occurredAt: new Date().toISOString(),
    }),
    [error],
  )

  return (
    <div className="flex min-h-svh items-start justify-center px-6 pt-36">
      <div className="flex w-full max-w-md flex-col gap-4">
        <AlertTriangle
          className="size-10 stroke-[1.5] text-foreground"
          aria-hidden
        />
        <h1 className="text-2xl font-semibold tracking-tight">
          This page couldn't load
        </h1>
        <p className="text-sm text-muted-foreground">
          A server error occurred. Reload to try again, or send a report so we
          can investigate.
        </p>
        <div className="flex flex-wrap items-start gap-2 pt-2">
          <Button type="button" onClick={() => reset()}>
            Reload
          </Button>
          <ErrorReportButton payload={payload} />
        </div>
        {error.digest ? (
          <p className="pt-6 font-mono text-[11px] tracking-wider text-muted-foreground uppercase">
            digest {error.digest}
          </p>
        ) : null}
      </div>
    </div>
  )
}
