#!/usr/bin/env tsx
/**
 * Dev CLI — issue a signup JWT and print the full /auth/signup/start
 * link the recipient should open in their browser.
 *
 * Usage:
 *   pnpm tsx packages/auth/scripts/issue-signup-token.ts \
 *     --email owner@example.com \
 *     --workspace "Acme Accounting" \
 *     [--base-url http://localhost:3000] \
 *     [--ttl 1209600]            # seconds; default 14 days
 *
 * Reads APP_TOKEN_SECRET from process.env (or `apps/web/.env.local`
 * loaded via `--env-file` flag if you prefer). Refuses to run without it.
 *
 * The signup-token cookie path was widened to "/" in Phase 5 so the
 * cookie survives the handoff into /onboarding/*. The recipient opens
 * the printed URL → /auth/signup/start verifies + sets the cookie →
 * 302 to /auth/signup welcome card → onboarding wizard.
 */
import { signSignupToken } from "../src/tokens/signup"

interface Args {
  email: string
  workspace: string
  baseUrl: string
  ttlSeconds: number
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }

  const email = get("--email")
  const workspace = get("--workspace")
  const baseUrl = get("--base-url") ?? "http://localhost:3000"
  const ttlSeconds = Number(get("--ttl") ?? 60 * 60 * 24 * 14)

  if (!email) throw new Error("--email is required")
  if (!workspace) throw new Error("--workspace is required")
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("--ttl must be a positive number of seconds")
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`--email "${email}" is not a valid email address`)
  }

  return { email, workspace, baseUrl, ttlSeconds }
}

async function main(): Promise<void> {
  if (!process.env.APP_TOKEN_SECRET) {
    console.error(
      "ERROR: APP_TOKEN_SECRET is not set in the environment.\n" +
        "  Set it from apps/web/.env.local, or generate one with:\n" +
        "    bash scripts/generate-env.sh\n" +
        "  Then re-run with the same secret loaded.",
    )
    process.exit(2)
  }

  const args = parseArgs(process.argv.slice(2))
  const token = await signSignupToken(
    { email: args.email, workspace: args.workspace },
    args.ttlSeconds,
  )
  const link = `${args.baseUrl}/auth/signup/start?token=${encodeURIComponent(token)}`

  const expiresAt = new Date(Date.now() + args.ttlSeconds * 1000)

  console.log("")
  console.log("Signup link issued:")
  console.log("  email:      ", args.email)
  console.log("  workspace:  ", args.workspace)
  console.log("  expires_at: ", expiresAt.toISOString())
  console.log("  ttl_seconds:", args.ttlSeconds)
  console.log("")
  console.log(link)
  console.log("")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
