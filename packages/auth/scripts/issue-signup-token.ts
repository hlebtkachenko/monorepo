#!/usr/bin/env tsx
/**
 * Dev CLI — issue a signup token and print the full /auth/signup/start
 * link the recipient should open in their browser.
 *
 * Usage:
 *   pnpm tsx packages/auth/scripts/issue-signup-token.ts \
 *     --email owner@example.com \
 *     --workspace "Acme Accounting" \
 *     [--base-url http://localhost:3000] \
 *     [--ttl 1209600]            # seconds; default 14 days
 *
 * When USE_AUTH_TOKEN_FOR_SIG=true, issues an opaque afkey token via
 * mintToken (requires DATABASE_URL). When false (default), issues a
 * legacy HS256 JWT (requires APP_TOKEN_SECRET).
 *
 * The signup-token cookie path was widened to "/" in Phase 5 so the
 * cookie survives the handoff into /onboarding/*. The recipient opens
 * the printed URL -> /auth/signup/start -> (new path) /auth/signup/landing
 * -> POST consumes -> /auth/signup welcome card -> onboarding wizard.
 */
import { signSignupToken } from "../src/tokens/signup"
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
  const useNewPath = process.env.USE_AUTH_TOKEN_FOR_SIG === "true"

  if (!useNewPath && !process.env.APP_TOKEN_SECRET) {
    console.error(
      "ERROR: APP_TOKEN_SECRET is not set in the environment.\n" +
        "  Set it from apps/web/.env.local, or generate one with:\n" +
        "    bash scripts/generate-env.sh\n" +
        "  Then re-run with the same secret loaded.\n" +
        "  Alternatively, set USE_AUTH_TOKEN_FOR_SIG=true to use the new\n" +
        "  opaque-token path (requires DATABASE_URL).",
    )
    process.exit(2)
  }

  const args = parseArgs(process.argv.slice(2))
  let token: string
  let expiresAt: Date

  if (useNewPath) {
    const minted = await mintToken({
      kind: "sig",
      payload: { email: args.email, workspace: args.workspace },
      ttlSeconds: args.ttlSeconds,
    })
    token = minted.rawToken
    expiresAt = minted.expiresAt
  } else {
    token = await signSignupToken(
      { email: args.email, workspace: args.workspace },
      args.ttlSeconds,
    )
    expiresAt = new Date(Date.now() + args.ttlSeconds * 1000)
  }

  const link = `${args.baseUrl}/auth/signup/start?token=${encodeURIComponent(token)}`

  console.log("")
  console.log("Signup link issued:")
  console.log(
    "  path:       ",
    useNewPath ? "new (opaque auth_token)" : "legacy (JWT)",
  )
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
