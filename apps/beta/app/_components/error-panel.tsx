"use client"

import * as React from "react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { Button } from "@workspace/ui/components/button"

import { useBetaTranslations } from "@/i18n/translations"
import { logCalmedError } from "@/lib/demo-mode"

import { useCalmErrors } from "./calm-errors"

/**
 * The body of every `error.tsx` in this app — one component, two tones.
 *
 * Each boundary file is three lines of wiring around this; the copy, the
 * styling and the logging live here so a second boundary cannot invent a third
 * way of saying "it broke".
 *
 * LOUD (the default, and the deployed state): a destructive `Alert` that says
 * something went wrong and offers `reset()`. This is what the portal should say
 * to a real client whose page genuinely failed — hiding it would mean they wait
 * for data that is never coming.
 *
 * CALM (`BETA_DEMO_CALM_ERRORS=true`): the same layout in the neutral `Alert`
 * variant, reading "Data se připravují." The retry button stays — it is the one
 * control that can actually end the state — but it is rendered as an ordinary
 * outline button rather than as the escape hatch from an error.
 *
 * WHERE THE ERROR GOES WHEN THE SCREEN STOPS SAYING IT. `logCalmedError` on the
 * calm path only, so the flag-off render logs nothing extra and the terminal
 * reads exactly as it does today. Note that this is the BROWSER console: an
 * error boundary is a Client Component by Next's definition. The server-side
 * half of the same story is `instrumentation.ts`'s `onRequestError`, which sees
 * every error thrown during a server render or a Server Action and writes the
 * same `[calm-demo]` prefix into the dev-server terminal.
 *
 * `error.digest` is the only handle a production build gives the operator for a
 * server error (the message itself is stripped before it crosses to the
 * browser), so it is what gets logged rather than a stack that will read
 * `<redacted>`.
 */
export function ErrorPanel({
  where,
  error,
  reset,
}: Readonly<{
  /** The route this boundary guards — the log line's only context. */
  where: string
  error: Error & { digest?: string }
  reset: () => void
}>) {
  const t = useBetaTranslations()
  const calm = useCalmErrors()

  // Logged once per error, not once per render: `reset()` re-renders this
  // boundary while React retries, and a log line per attempt would bury the
  // first one under its own retries.
  React.useEffect(() => {
    if (!calm) return
    logCalmedError(where, error.digest ?? error)
  }, [calm, where, error])

  return (
    <div className="grid place-items-center px-4 py-12">
      <Alert
        variant={calm ? "default" : "destructive"}
        className="max-w-lg justify-items-start gap-2"
      >
        <AlertTitle>
          {calm ? t("chyba.calmTitle") : t("chyba.title")}
        </AlertTitle>
        <AlertDescription>
          {calm ? t("chyba.calmBody") : t("chyba.body")}
        </AlertDescription>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="mt-1"
          onClick={reset}
        >
          {calm ? t("chyba.calmRetry") : t("chyba.retry")}
        </Button>
      </Alert>
    </div>
  )
}
