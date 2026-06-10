"use client"

import { useEffect } from "react"
import { reportClientError } from "./_lib/report-error"

// Root error boundary (OBS-03) — catches errors in the root layout itself.
// Must render its own <html>/<body>; the root layout (and its CSS) may not
// have rendered, so styling is inline (same as apps/web/app/global-error.tsx).
export default function GlobalError({
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
    <html lang="en">
      <body style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
        <h2>Something went wrong</h2>
        <button type="button" onClick={() => reset()}>
          Try again
        </button>
      </body>
    </html>
  )
}
