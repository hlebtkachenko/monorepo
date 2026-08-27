/**
 * Calm demo mode — the one switch behind "a live demo must never show a red
 * error to a client sitting in the room".
 *
 * WHAT IT CHANGES, AND ONLY THIS. When a SYSTEM failure happens — a query that
 * threw, a dropped upload, an assistant the provider could not reach — the
 * portal normally says so in destructive red. Under this switch those three
 * surfaces render a neutral "still working on it" state instead, and the error
 * goes to the log rather than to the screen. Nothing is retried differently,
 * nothing is swallowed at the data layer, and no write is reported as having
 * succeeded: the change is purely what the screen SAYS about a failure it has
 * already had.
 *
 * WHAT IT MUST NEVER TOUCH: VALIDATION. Every field-level refusal in this app —
 * `zadavani.errorAmountInvalid`, `uzaverka.errorPeriodInvalid`, the whole family
 * the `_actions/input.ts` readers produce, and the DB-rule sentences
 * (`errorRejected`) underneath them — is GUIDANCE. It tells the office which
 * box to fix. A form whose refusals are hidden behind "zpracovává se…" is a form
 * that silently discards work, which is a worse demo than a red line and a much
 * worse product. The gate is deliberately blind to those states.
 *
 * THE AMBIGUOUS MIDDLE IS LEFT VISIBLE, ON PURPOSE. `uploadErrorForbidden`
 * ("you may not upload"), `uploadErrorQuota` ("storage is full, call the
 * office"), `nastaveni.errorAresUnavailable` ("fill it in by hand instead") and
 * `nastaveni.errorNotSaved` all describe a condition the viewer can act on even
 * though a machine caused it. Calming them would remove the only instruction on
 * screen. Where a failure could be read either way, it stays visible.
 *
 * DEFAULT OFF, AND OFF EVERYWHERE. `BETA_DEMO_CALM_ERRORS` is set in no deploy
 * config — not in `infra/cdk/lib/beta-app-stack.ts`, not in any GitHub
 * environment, not in the Dockerfile. It exists for one situation: Hleb running
 * the portal in front of a client and not wanting a transient failure to become
 * the topic of the meeting. Read the same way `BETA_TOTP_REQUIRED` and
 * `BETA_ASSISTANT_ENABLED` are — exact string, trimmed — so this app has one
 * spelling of a gate rather than three.
 */

type Env = Record<string, string | undefined>

/**
 * Is calm demo mode switched on for this process?
 *
 * `true` AND NOT `1`/`yes`/`on`/`TRUE` — one spelling, compared exactly,
 * because a fuzzy truthiness check is how a gate ends up open on the string
 * `"false"`. Identical in shape to `totpEnforcementEnabled`.
 */
export function calmErrorsEnabled(env: Env = process.env): boolean {
  return env["BETA_DEMO_CALM_ERRORS"]?.trim() === "true"
}

/**
 * The prefix every calmed error carries into the log.
 *
 * The whole point of the mode is that the operator, not the client, learns what
 * broke — so a suppressed failure has to be findable in one `grep`. Deliberately
 * NOT the `[beta:<area>]` shape `lib/notifications/events.ts` uses: those lines
 * are ordinary operational noise, these are "something is on fire and the screen
 * is lying about it", and during a demo that distinction is the only one worth
 * making at a glance.
 */
const CALM_LOG_PREFIX = "[calm-demo]"

/**
 * Report a failure the screen is about to hide.
 *
 * `where` is the route or action the failure belongs to (`"/[orgSlug]"`,
 * `"dokumenty/upload"`, `"asistent/chat"`), because the calmed screen no longer
 * carries that context and the log line is the only place left to put it.
 *
 * Called ONLY on the suppressing path. With the gate off nothing is suppressed,
 * so nothing extra is logged and the terminal reads exactly as it does today.
 */
export function logCalmedError(where: string, error: unknown): void {
  console.error(`${CALM_LOG_PREFIX} ${where}`, error)
}
