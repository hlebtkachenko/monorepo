#!/usr/bin/env tsx
/**
 * Dev CLI — issue an opaque signup token (`kind='sig'`) and print the
 * full /auth/signup link the recipient should open in their browser.
 *
 * Requires DATABASE_URL so the auth_token row can be persisted.
 *
 * Usage:
 *   pnpm tsx packages/auth/scripts/issue-signup-token.ts \
 *     --email owner@example.com \
 *     --workspace "Acme Accounting" \
 *     [--base-url http://localhost:3000] \
 *     [--ttl 172800]             # seconds; default 48 hours
 *
 * The recipient opens the printed URL → /auth/signup welcome page →
 * Continue button POSTs to /auth/signup/consume → __Host-afkey-sig +
 * app-signup-payload cookies set → onboarding wizard.
 */
import { mintToken } from "../src/tokens/auth-token"

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
  const ttlSeconds = Number(get("--ttl") ?? 60 * 60 * 48)

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
  if (!process.env.DATABASE_URL && !process.env.DATABASE_DIRECT_URL) {
    console.error(
      "ERROR: DATABASE_URL (or DATABASE_DIRECT_URL) must be set so the auth_token row can be persisted.",
    )
    process.exit(2)
  }

  const args = parseArgs(process.argv.slice(2))
  const minted = await mintToken({
    kind: "sig",
    payload: { email: args.email, workspace: args.workspace },
    ttlSeconds: args.ttlSeconds,
  })

  const link = `${args.baseUrl}/auth/signup?token=${encodeURIComponent(minted.rawToken)}`

  console.log("")
  console.log("Signup link issued:")
  console.log("  email:      ", args.email)
  console.log("  workspace:  ", args.workspace)
  console.log("  expires_at: ", minted.expiresAt.toISOString())
  console.log("  ttl_seconds:", args.ttlSeconds)
  console.log("")
  console.log(link)
  console.log("")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
