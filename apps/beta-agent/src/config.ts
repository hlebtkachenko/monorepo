/**
 * Where the office agent points and what it authenticates with.
 *
 * TWO VARIABLES, NO CONFIG FILE, NO KEYCHAIN. `apps/cli` persists a profile to
 * `~/.config/afframe/config.toml` because it is a client many people install;
 * this tool is run by ONE office, from a checkout, at month end. A file on disk
 * would be a second place a live agent credential lives, and the first place a
 * backup tool would sweep it up from. The key is passed in the environment, held
 * in memory for the length of one command, and dropped.
 *
 * THE KEY IS NEVER PRINTED. Not on success, not in an error, not in `--dry-run`
 * output, not in a `--verbose` mode (there is none). Nothing in this package
 * renders it at all — not even redacted — because a redaction helper is an
 * invitation to render it somewhere, and `beta-agent check` already answers the
 * only diagnostic question an operator has ("is this key live, and what does it
 * reach") from the server rather than from the string.
 */
export type AgentConfig = {
  /** Origin of the beta portal, without a trailing slash. */
  readonly baseUrl: string
  readonly key: string
}

/** The env var names, in one place so the messages and the reader agree. */
const ENV_URL = "BETA_AGENT_URL"
const ENV_KEY = "BETA_AGENT_KEY"

export class ConfigError extends Error {}

/**
 * Read the two variables, or refuse in Czech.
 *
 * A missing variable is refused BEFORE a file is read or a CSV is parsed: the
 * office should learn that the shell is not set up in the first second of the
 * command, not after a 5 000-row předvaha has been transformed.
 */
export function readConfig(env: NodeJS.ProcessEnv): AgentConfig {
  const rawUrl = (env[ENV_URL] ?? "").trim()
  const key = (env[ENV_KEY] ?? "").trim()

  if (rawUrl === "") {
    throw new ConfigError(
      `Chybí proměnná ${ENV_URL}. Nastavte adresu portálu, například: export ${ENV_URL}="https://beta.afframe.com"`,
    )
  }
  if (key === "") {
    throw new ConfigError(
      `Chybí proměnná ${ENV_KEY}. Vložte klíč agenta vydaný v /admin: export ${ENV_KEY}="afb_agent_..."`,
    )
  }

  let parsed: URL
  try {
    parsed = new URL(rawUrl)
  } catch {
    throw new ConfigError(
      `Proměnná ${ENV_URL} není platná adresa: "${rawUrl}". Očekává se například https://beta.afframe.com`,
    )
  }
  // http is allowed ONLY for a loopback host, so a dev run against
  // http://localhost:3200 works while a production key can never be sent
  // unencrypted to a real host by a typo in one letter of the scheme.
  const loopback =
    parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1"
  if (
    parsed.protocol !== "https:" &&
    !(parsed.protocol === "http:" && loopback)
  ) {
    throw new ConfigError(
      `Proměnná ${ENV_URL} musí používat https (výjimkou je jen localhost). Zadáno: "${rawUrl}"`,
    )
  }

  return {
    baseUrl: `${parsed.origin}${parsed.pathname.replace(/\/+$/, "")}`,
    key,
  }
}
