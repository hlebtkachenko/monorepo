"use client"

import { ErrorPanel } from "../../_components/error-panel"

/**
 * The boundary that matters for the demo.
 *
 * It sits BELOW `[orgSlug]/layout.tsx`, so a page that throws — a failed read on
 * Přehled, Dokumenty, Finance, Mzdy, anywhere in the org tree — loses only the
 * page body. The rail, the org switcher and the account menu stay on screen, and
 * every other module is still one click away. The root `app/error.tsx` would
 * replace the whole shell with a bare card, which reads as "the product fell
 * over" even when a single query was at fault.
 *
 * `where="/[orgSlug]"` rather than the resolved slug: the log line is for the
 * operator watching a dev server, and naming the segment says which boundary
 * caught it without putting a client's organization into a log the mode exists
 * to make greppable.
 */
export default function OrgError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorPanel where="/[orgSlug]" error={error} reset={reset} />
}
