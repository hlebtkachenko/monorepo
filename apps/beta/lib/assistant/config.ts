/**
 * Asistent configuration — the dark-launch gate and the five budget controls
 * (spec §2.8 F31).
 *
 * TWO INDEPENDENT GATES, BOTH OFF WHEN UNSET. Hleb's standing rule for this
 * module is that BUILDING it is allowed and EXPOSING it is not, so the two
 * halves of "exposed" are separate switches and neither defaults to on:
 *
 *   BETA_ASSISTANT_ENABLED   gates the SURFACE. Unset or anything other than
 *                            the exact string "true" and the rail entry is
 *                            absent, `/[orgSlug]/asistent` answers 404, and the
 *                            chat route answers 404. This is the switch the
 *                            client-exposure gate flips.
 *   BETA_ASSISTANT_API_KEY   gates the PROVIDER CALL. Absent and every send is
 *                            refused with a Czech message before any network
 *                            call is attempted. No deployment sets it today and
 *                            this repository contains no key.
 *
 * A surface that is enabled without a key is a usable, honest state: the UI
 * renders and every send says the assistant is unavailable. That is what makes
 * the module reviewable before a key exists anywhere.
 *
 * "true" AND NOT "1"/"yes"/"on". One spelling, compared exactly, because a
 * fuzzy truthiness check is how a gate ends up open on the string "false".
 *
 * WHY A BAD NUMBER FALLS BACK RATHER THAN THROWING. Every numeric control here
 * is a CEILING. A malformed value must not remove the ceiling, and it must not
 * take the whole app down either — so it falls back to the built-in default
 * (which is stricter than anything an operator would deliberately configure)
 * and says so on stderr once per process.
 *
 * PURE MODULE — no `server-only`, no database, env injected as a parameter so
 * the whole thing is unit-testable without touching `process.env`.
 */
import { BETA_TIME_ZONE } from "@/i18n/formats"

type Env = Record<string, string | undefined>

/**
 * The model, spec §2.8: "Anthropic API, latest Sonnet default
 * (env-configurable)". Overridden by `BETA_ASSISTANT_MODEL`.
 */
export const ASSISTANT_DEFAULT_MODEL = "claude-sonnet-5"

/**
 * Defaults for the four numeric controls. `userDailyMessages` is the one number
 * spec §2.8 states outright (50); the other three are chosen to be the
 * strictest values the feature is still usable at, because they are what a
 * misconfigured environment falls back to.
 */
export const ASSISTANT_DEFAULTS = Object.freeze({
  /** Control 4 — `max_tokens` cap on the response. */
  maxTokens: 1500,
  /** Control 5 — how many past messages are replayed as context. */
  historyMessages: 20,
  /** Control 3 — per-user, per-day message allowance. */
  userDailyMessages: 50,
  /** Control 1 — install-wide monthly token budget (input + output). */
  monthlyTokenBudget: 2_000_000,
  /**
   * Not one of the five, but the floor under all of them: an input this long
   * cannot be sent, so no single turn can cost more than a bounded amount.
   * The database CHECK (`chat_message_content_shape`) is the second floor.
   */
  maxInputChars: 4000,
})

export type AssistantConfig = {
  readonly model: string
  readonly maxTokens: number
  readonly historyMessages: number
  readonly userDailyMessages: number
  readonly monthlyTokenBudget: number
  readonly maxInputChars: number
  /**
   * Whether `BETA_ASSISTANT_API_KEY` is present. The KEY ITSELF is deliberately
   * not on this object: only `provider.ts` reads it, so it never travels
   * through the route, the data layer, or a log line.
   */
  readonly providerConfigured: boolean
}

const warned = new Set<string>()

function warnOnce(name: string, raw: string, fallback: number): void {
  if (warned.has(name)) return
  warned.add(name)
  console.warn(
    `[beta:assistant] ${name}=${JSON.stringify(raw)} is not a positive ` +
      `integer — falling back to ${fallback}.`,
  )
}

function readPositiveInt(env: Env, name: string, fallback: number): number {
  const raw = env[name]?.trim()
  if (!raw) return fallback
  // `Number.parseInt` would accept "50abc" and "1e9"; the whole string has to
  // be digits for the value to mean what the operator wrote.
  if (!/^\d+$/.test(raw)) {
    warnOnce(name, raw, fallback)
    return fallback
  }
  const value = Number(raw)
  if (!Number.isSafeInteger(value) || value <= 0) {
    warnOnce(name, raw, fallback)
    return fallback
  }
  return value
}

/**
 * Is the Asistent SURFACE switched on?
 *
 * Read by the rail, the page and the route. Everything else in this module can
 * be evaluated safely whether or not this is true — it is the one call that
 * decides whether the module is reachable at all.
 */
export function assistantSurfaceEnabled(env: Env = process.env): boolean {
  return env["BETA_ASSISTANT_ENABLED"]?.trim() === "true"
}

export function readAssistantConfig(env: Env = process.env): AssistantConfig {
  return Object.freeze({
    model: env["BETA_ASSISTANT_MODEL"]?.trim() || ASSISTANT_DEFAULT_MODEL,
    maxTokens: readPositiveInt(
      env,
      "BETA_ASSISTANT_MAX_TOKENS",
      ASSISTANT_DEFAULTS.maxTokens,
    ),
    historyMessages: readPositiveInt(
      env,
      "BETA_ASSISTANT_HISTORY_MESSAGES",
      ASSISTANT_DEFAULTS.historyMessages,
    ),
    userDailyMessages: readPositiveInt(
      env,
      "BETA_ASSISTANT_USER_DAILY_MESSAGES",
      ASSISTANT_DEFAULTS.userDailyMessages,
    ),
    monthlyTokenBudget: readPositiveInt(
      env,
      "BETA_ASSISTANT_MONTHLY_TOKEN_BUDGET",
      ASSISTANT_DEFAULTS.monthlyTokenBudget,
    ),
    maxInputChars: readPositiveInt(
      env,
      "BETA_ASSISTANT_MAX_INPUT_CHARS",
      ASSISTANT_DEFAULTS.maxInputChars,
    ),
    providerConfigured: (env["BETA_ASSISTANT_API_KEY"]?.trim().length ?? 0) > 0,
  })
}

/**
 * The API key, for `provider.ts` and nothing else.
 *
 * Exported rather than inlined so there is exactly ONE place in the source tree
 * that names the variable, and so a future audit can grep for its single
 * caller. It is never returned as part of `AssistantConfig`.
 */
export function readAssistantApiKey(env: Env = process.env): string | null {
  const raw = env["BETA_ASSISTANT_API_KEY"]?.trim()
  return raw ? raw : null
}

const dayFormat = new Intl.DateTimeFormat("en-CA", {
  timeZone: BETA_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/**
 * The Prague calendar day of `now`, as `YYYY-MM-DD` — the `chat_usage`
 * partition key.
 *
 * NOT `CURRENT_DATE` and not `toISOString().slice(0, 10)`. The container runs
 * in UTC, so both of those roll the daily allowance over at 01:00 or 02:00
 * Prague time, which the office would report as "it forgot my limit early".
 * `en-CA` is used purely because its short date format IS ISO order; the
 * timezone, not the locale, is what carries meaning here.
 */
export function pragueDay(now: Date): string {
  return dayFormat.format(now)
}

/**
 * The first Prague day of the month `usageDate` falls in, as `YYYY-MM-DD`.
 *
 * Derived from the already-localized day string by string surgery rather than
 * by a second timezone conversion: `pragueDay` has done the only conversion
 * that can go wrong, and the first of a month is the first of that month in
 * every timezone.
 */
export function pragueMonthStart(usageDate: string): string {
  return `${usageDate.slice(0, 7)}-01`
}

/**
 * The first day of the FOLLOWING month, as `YYYY-MM-DD` — the exclusive upper
 * bound of the monthly window.
 *
 * The budget sum needs both ends. A half-open range (`usage_date >= month
 * start`, no upper bound) sums every future-dated row too, which is not a
 * hypothetical: a turn started just before Prague midnight and recorded just
 * after is already dated tomorrow, and any month queried in arrears would
 * silently include everything since.
 */
export function pragueNextMonthStart(usageDate: string): string {
  const year = Number(usageDate.slice(0, 4))
  const month = Number(usageDate.slice(5, 7))
  return month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, "0")}-01`
}
