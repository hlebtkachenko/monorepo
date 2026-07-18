"use client"

import { useEffect } from "react"
import { useParams } from "next/navigation"

import { ErrorShell } from "@workspace/ui/blocks/app-shell"

import { orgHref } from "@/lib/org/href"

export default function OrgError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  // Surface the failure to the client console (or a telemetry sink, if one is
  // wired) so a support reference id has something to correlate against.
  useEffect(() => {
    console.error(error)
  }, [error])

  // Home points back into the app: the org home when the slug is in scope,
  // otherwise the workspace hub — never the marketing root.
  const slug = useParams<{ orgSlug: string }>()?.orgSlug
  const homeHref = slug ? orgHref(slug) : "/workspace"

  return (
    <ErrorShell
      variant="error"
      onReset={reset}
      errorId={error.digest}
      homeHref={homeHref}
    />
  )
}
