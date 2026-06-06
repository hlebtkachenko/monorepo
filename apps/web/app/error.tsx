"use client"

import { useEffect } from "react"
import { reportClientError } from "./_lib/report-error"

// Route-segment error boundary. Reports, then offers a retry.
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
    <div style={{ fontFamily: "system-ui, sans-serif", padding: "2rem" }}>
      <h2>Something went wrong</h2>
      <button type="button" onClick={() => reset()}>
        Try again
      </button>
    </div>
  )
}
