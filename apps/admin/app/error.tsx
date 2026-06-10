"use client"

import { useEffect } from "react"
import { ErrorShell } from "@workspace/ui/blocks/app-shell"
import { reportClientError } from "./_lib/report-error"

// Route-segment error boundary (OBS-03). Reports through the same-origin
// /api/client-error sink, then offers a retry. Renders inside the root
// layout, so the design-system surface is available.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    reportClientError(error, error.digest)
  }, [error])

  return (
    <ErrorShell
      variant="error"
      onReset={reset}
      homeHref="/"
      homeLabel="Go home"
      errorId={error.digest}
    />
  )
}
