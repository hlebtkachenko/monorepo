"use client"

import { UtilityPage } from "@workspace/ui/blocks/utility-page"

import { LanguagePicker } from "../_components/language-picker"

export default function GatedError({
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
        surface: "shell",
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
