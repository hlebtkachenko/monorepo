import { createInterface } from "node:readline/promises"
import { stdin as input, stdout as output } from "node:process"
import { Command, Option } from "commander"
import { Afframe, AfframeApiError, RateLimitError } from "@afframe/sdk"
import { clearProfile, loadConfig, saveProfile } from "./config"

const VERSION = "0.0.1"

/**
 * `afframe` — command-line client for api.afframe.com/v1.
 *
 * Today: login / logout / whoami / ping / api. Resource ops, listen, and
 * trigger land with the matching API surfaces (see docs/api/CLI.md).
 *
 * Auth: API key paste-and-validate. Stored at ~/.config/afframe/config.toml
 * (mode 0600). Override per invocation with AFFRAME_API_KEY / AFFRAME_API_BASE
 * env vars; switch profiles with AFFRAME_PROFILE.
 */
const program = new Command()
program
  .name("afframe")
  .description("Afframe command-line client")
  .version(VERSION)

program
  .command("login")
  .description(
    "Authenticate by pasting an affk_live_ API key (sandbox affk_test_ keys: not issued yet).",
  )
  .addOption(
    new Option("--api-key <key>", "API key (non-interactive)").env(
      "AFFRAME_API_KEY",
    ),
  )
  .addOption(
    new Option(
      "--base-url <url>",
      "Override the API base URL (default https://api.afframe.com)",
    ).env("AFFRAME_API_BASE"),
  )
  .option("--profile <name>", "Profile to write to", "default")
  .action(
    async (opts: { apiKey?: string; baseUrl?: string; profile: string }) => {
      let apiKey = opts.apiKey
      if (!apiKey) {
        if (!input.isTTY) {
          program.error("--api-key required (non-interactive)", { exitCode: 1 })
        }
        const rl = createInterface({ input, output })
        apiKey = (await rl.question("Paste an API key (affk_live_…): ")).trim()
        rl.close()
      }
      if (!apiKey) program.error("No API key provided", { exitCode: 1 })

      // Validate by hitting /v1/ping; refuse to persist on failure.
      const client = new Afframe({ apiKey: apiKey!, baseUrl: opts.baseUrl })
      try {
        const res = await client.meta.ping()
        saveProfile(opts.profile, apiKey!, opts.baseUrl)
        const mode = apiKey!.startsWith("affk_test_")
          ? "TEST"
          : apiKey!.startsWith("affk_live_")
            ? "LIVE"
            : "UNKNOWN-PREFIX"
        output.write(
          `Authenticated. profile=${opts.profile} mode=${mode}\n` +
            `  organization=${res.principal.organizationId}\n` +
            `  workspace=${res.principal.workspaceId}\n` +
            `Wrote ~/.config/afframe/config.toml (0600).\n`,
        )
      } catch (err) {
        handleError(err, "login failed")
      }
    },
  )

program
  .command("logout")
  .description("Clear the active profile from ~/.config/afframe/config.toml.")
  .option("--profile <name>", "Profile to clear", "default")
  .action((opts: { profile: string }) => {
    clearProfile(opts.profile)
    output.write(`Cleared profile=${opts.profile}.\n`)
  })

program
  .command("whoami")
  .description(
    "Resolve the principal — confirm the configured key authenticates.",
  )
  .action(async () => {
    const cfg = requireConfig()
    const client = new Afframe({ apiKey: cfg.apiKey, baseUrl: cfg.apiBase })
    try {
      const res = await client.meta.ping()
      const mode = cfg.apiKey.startsWith("affk_test_") ? "TEST" : "LIVE"
      output.write(
        `profile=${cfg.profile} mode=${mode}\n` +
          `organization=${res.principal.organizationId}\n` +
          `workspace=${res.principal.workspaceId}\n`,
      )
    } catch (err) {
      handleError(err, "whoami failed")
    }
  })

program
  .command("ping")
  .description("Hit GET /v1/ping with the configured key.")
  .action(async () => {
    const cfg = requireConfig()
    const client = new Afframe({ apiKey: cfg.apiKey, baseUrl: cfg.apiBase })
    try {
      const res = await client.meta.ping()
      output.write(JSON.stringify(res, null, 2) + "\n")
    } catch (err) {
      handleError(err, "ping failed")
    }
  })

program
  .command("api <path>")
  .description(
    "Raw GET against an arbitrary API path (e.g., /v1/organization).",
  )
  .action(async (path: string) => {
    const cfg = requireConfig()
    const url = `${cfg.apiBase.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`
    const res = await fetch(url, {
      headers: {
        authorization: `Bearer ${cfg.apiKey}`,
        accept: "application/json",
      },
    })
    const body = await res.text()
    output.write(body + (body.endsWith("\n") ? "" : "\n"))
    if (!res.ok) process.exit(2)
  })

function requireConfig(): NonNullable<ReturnType<typeof loadConfig>> {
  const cfg = loadConfig()
  if (!cfg) {
    program.error(
      "No API key found. Run `afframe login` or set AFFRAME_API_KEY.",
      { exitCode: 1 },
    )
  }
  return cfg!
}

function handleError(err: unknown, prefix: string): never {
  if (err instanceof RateLimitError) {
    output.write(
      `${prefix}: rate limited (retry-after=${err.retryAfter ?? "?"}s). request_id=${err.requestId}\n`,
    )
    process.exit(2)
  }
  if (err instanceof AfframeApiError) {
    output.write(
      `${prefix}: [${err.code}] ${err.message}\n` +
        `  status=${err.status} request_id=${err.requestId}\n` +
        (err.documentationUrl ? `  docs=${err.documentationUrl}\n` : ""),
    )
    process.exit(err.status >= 500 ? 2 : 1)
  }
  output.write(`${prefix}: ${(err as Error).message}\n`)
  process.exit(2)
}

program.parseAsync().catch((err: unknown) => {
  output.write(`afframe: ${(err as Error).message}\n`)
  process.exit(2)
})
