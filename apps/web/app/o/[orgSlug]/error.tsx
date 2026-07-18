"use client"

import { ErrorShell } from "@workspace/ui/blocks/app-shell"

export default function OrgError({
  reset,
}: {
  error: Error
  reset: () => void
}) {
  return <ErrorShell variant="error" onReset={reset} />
}
