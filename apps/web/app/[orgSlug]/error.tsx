"use client"

import { useParams } from "next/navigation"
import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "../_components/language-picker"

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
  const { orgSlug } = useParams<{ orgSlug: string }>()

  return (
    <UtilityPage
      state={
        error.digest ? "unexpected_server_error" : "unexpected_client_error"
      }
      runtime={{
        surface: "shell",
        actionHrefs: { go_back: `/${encodeURIComponent(orgSlug)}` },
        onRetry: reset,
        referenceId: error.digest,
        report: {
          payload: {
            message: error.message || "Unknown application error",
            digest: error.digest,
            source: "web",
          },
        },
      }}
      footerControl={<LanguagePicker />}
    />
  )
}
