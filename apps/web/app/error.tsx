"use client"

import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "./_components/language-picker"

// Route-segment error boundary. Reports, then offers a retry.
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <UtilityPage
      state={
        error.digest ? "unexpected_server_error" : "unexpected_client_error"
      }
      runtime={{
        surface: "global",
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
