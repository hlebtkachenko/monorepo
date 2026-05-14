#!/usr/bin/env tsx
/**
 * Dev CLI — issue an invite JWT and print the /auth/invite/start link.
 *
 * Usage:
 *   pnpm tsx packages/auth/scripts/issue-invite-token.ts \
 *     --email teammate@example.com \
 *     --org <organization-id-uuid> \
 *     [--role member|admin|owner|agent|guest] \
 *     [--base-url http://localhost:3000] \
 *     [--ttl 604800]                       # seconds; default 7 days
 *
 * The invite-token cookie path was widened to "/" in Phase 6 so the
 * cookie survives the handoff into /onboarding/member/*.
 *
 * Organization must already exist (auth_invite has a NOT NULL
 * organization_id). Create one first via:
 *   pnpm tsx packages/auth/scripts/seed-organization.ts ...
 */
import { signInviteToken, type InviteClaims } from "../src/tokens/invite"

interface Args {
  email: string
  organizationId: string
  role: InviteClaims["role"]
  baseUrl: string
  ttlSeconds: number
}

const VALID_ROLES: ReadonlyArray<InviteClaims["role"]> = [
  "owner",
  "admin",
  "member",
  "agent",
  "guest",
]

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }

  const email = get("--email")
  const organizationId = get("--org")
  const roleArg = (get("--role") ?? "member") as InviteClaims["role"]
  const baseUrl = get("--base-url") ?? "http://localhost:3000"
  const ttlSeconds = Number(get("--ttl") ?? 60 * 60 * 24 * 7)

  if (!email) throw new Error("--email is required")
  if (!organizationId) throw new Error("--org is required")
  if (!VALID_ROLES.includes(roleArg)) {
    throw new Error(
      `--role must be one of: ${VALID_ROLES.join(", ")} (got "${roleArg}")`,
    )
  }
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      organizationId,
    )
  ) {
    throw new Error(`--org "${organizationId}" is not a valid UUID`)
  }
  if (!Number.isFinite(ttlSeconds) || ttlSeconds <= 0) {
    throw new Error("--ttl must be a positive number of seconds")
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error(`--email "${email}" is not a valid email address`)
  }

  return { email, organizationId, role: roleArg, baseUrl, ttlSeconds }
}

async function main(): Promise<void> {
  if (!process.env.APP_TOKEN_SECRET) {
    console.error(
      "ERROR: APP_TOKEN_SECRET is not set in the environment.\n" +
        "  Source it from apps/web/.env.local before running.",
    )
    process.exit(2)
  }

  const args = parseArgs(process.argv.slice(2))
  const token = await signInviteToken(
    {
      email: args.email,
      organizationId: args.organizationId,
      role: args.role,
    },
    args.ttlSeconds,
  )
  const link = `${args.baseUrl}/auth/invite/start?token=${encodeURIComponent(token)}`

  const expiresAt = new Date(Date.now() + args.ttlSeconds * 1000)

  console.log("")
  console.log("Invite link issued:")
  console.log("  email:      ", args.email)
  console.log("  organization:", args.organizationId)
  console.log("  role:       ", args.role)
  console.log("  expires_at: ", expiresAt.toISOString())
  console.log("")
  console.log(link)
  console.log("")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
