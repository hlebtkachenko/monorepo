import type { Instrumentation } from "next"

import { calmErrorsEnabled, logCalmedError } from "@/lib/demo-mode"

/**
 * The SERVER half of calm demo mode's logging.
 *
 * `error.tsx` is a Client Component by Next's definition, so the line it writes
 * lands in the browser console — useful, but not where the operator is looking.
 * `onRequestError` is Next's own server-side hook: it fires in the Node runtime
 * for every error thrown during a server render, a Server Action or a route
 * handler, INCLUDING the ones an error boundary then swallows, and it is handed
 * the request path and the router kind that produced them. That is exactly the
 * context a calmed screen no longer carries.
 *
 * The result is that `BETA_DEMO_CALM_ERRORS=true pnpm --filter beta dev` prints
 * one greppable `[calm-demo] <method> <path>` line per hidden failure into the
 * terminal the demo is being run from, next to Next's own stack trace.
 *
 * GATED, so nothing changes with the flag unset. Next already logs server errors
 * on its own; with the mode off this hook adds no second line, and with the mode
 * on it adds the one tag that says "the client did not see this".
 *
 * NOTHING ELSE LIVES HERE. No `register()`, no tracer, no side effects at
 * module scope — this file is loaded in every runtime Next builds for, and the
 * only import it may safely carry is a pure one.
 */
export const onRequestError: Instrumentation.onRequestError = (
  error,
  request,
  context,
) => {
  if (!calmErrorsEnabled()) return

  logCalmedError(
    `${request.method} ${request.path} (${context.routeType})`,
    error,
  )
}
