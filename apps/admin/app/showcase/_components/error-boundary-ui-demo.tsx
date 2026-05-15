"use client"

import * as React from "react"

import { ErrorBoundaryUi } from "@workspace/ui/components/error-boundary-ui"

function buildError(): Error {
  const err = new Error("Cannot read property 'name' of undefined")
  err.name = "TypeError"
  err.stack = `TypeError: Cannot read property 'name' of undefined
    at UserCard (/src/components/UserCard.tsx:42:11)
    at renderWithProvider (/src/lib/render.ts:88:5)
    at /src/pages/index.tsx:18:3`
  return err
}

export function ErrorBoundaryUiDemo() {
  const [error, setError] = React.useState<Error>(buildError)

  return (
    <ErrorBoundaryUi
      error={error}
      resetError={() => setError(buildError())}
      componentStack={
        "    in UserCard (at index.tsx:18)\n    in Provider (at index.tsx:14)\n    in App"
      }
      isDev
    />
  )
}
