"use client"

import { useEffect } from "react"
import { ErrorShell } from "@workspace/ui/blocks/app-shell"

/**
 * Error boundary for `/[orgSlug]/*`. Sits inside the OrgLayout, so the
 * AppShell chrome remains painted; only the body slot is replaced. The
 * `reset` callback re-renders the segment via Next's error boundary.
 */
export default function OrgError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    console.error("[orgSlug/error] caught", error)
  }, [error])

  return (
    <ErrorShell
      variant="error"
      onReset={reset}
      homeHref="/workspace"
      homeLabel="Back to workspace"
      errorId={error.digest}
    />
  )
}
