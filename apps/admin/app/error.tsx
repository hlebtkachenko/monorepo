"use client"

import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "./_components/language-picker"

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
  return (
    <UtilityPage
      state={
        error.digest ? "unexpected_server_error" : "unexpected_client_error"
      }
      runtime={{
        application: "admin",
        surface: "global",
        onRetry: reset,
        referenceId: error.digest,
        report: {
          payload: {
            message: error.message || "Unknown admin error",
            digest: error.digest,
            source: "admin",
          },
        },
      }}
      footerControl={<LanguagePicker />}
    />
  )
}
