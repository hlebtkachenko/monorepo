#!/usr/bin/env tsx
/**
 * Dev CLI — issue an invite and email it. Mirrors the path the
 * onboarding team-step uses: mint an opaque random token, INSERT the
 * auth_invite row at status='pending' (storing only its SHA-256 hash),
 * send the invite email via the configured transport (Resend / SES /
 * Console).
 *
 * Usage:
 *   pnpm tsx packages/auth/scripts/issue-invite-token.ts \
 *     --email teammate@example.com \
 *     --org <organization-id-uuid> \
 *     [--role member|admin|owner|agent|guest] \
 *     [--issuer <issuer-user-id>] \
 *     [--brand Afframe] \
 *     [--base-url http://localhost:3000] \
 *     [--ttl 604800]                       # seconds; default 7 days
 *
 * Organization must already exist. If not, create one via:
 *   pnpm tsx packages/auth/scripts/seed-organization.ts ...
 */
import {
  issueInvite,
  revokePendingInvites,
  findOrganizationOwner,
} from "../src/invite-issuer"
import type { InviteRecord } from "../src/tokens/invite"

interface Args {
  email: string
  organizationId: string
  role: InviteRecord["role"]
  issuerUserId: string | null
  brandName: string
  baseUrl: string
  ttlSeconds: number
}

const VALID_ROLES: ReadonlyArray<InviteRecord["role"]> = [
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
  const roleArg = (get("--role") ?? "member") as InviteRecord["role"]
  const issuerUserId = get("--issuer") ?? null
  const brandName = get("--brand") ?? "Afframe"
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

  return {
    email,
    organizationId,
    role: roleArg,
    issuerUserId,
    brandName,
    baseUrl,
    ttlSeconds,
  }
}

async function main(): Promise<void> {
  if (!process.env.APP_TOKEN_SECRET) {
    console.error(
      "ERROR: APP_TOKEN_SECRET is not set in the environment.\n" +
        "  Source it from apps/web/.env.local before running.",
    )
    process.exit(2)
  }
  if (!process.env.DATABASE_URL && !process.env.DATABASE_DIRECT_URL) {
    console.error(
      "ERROR: DATABASE_URL (or DATABASE_DIRECT_URL) must be set so the auth_invite row can be persisted.",
    )
    process.exit(2)
  }

  const args = parseArgs(process.argv.slice(2))

  // Auto-discover the issuing user from the org's owner if not provided.
  const issuerUserId =
    args.issuerUserId ?? (await findOrganizationOwner(args.organizationId))

  // Revoke any older pending invites for the same (org, email) so the
  // recipient can only redeem the latest link.
  const revoked = await revokePendingInvites({
    organizationId: args.organizationId,
    email: args.email,
  })

  const { inviteId, url, expiresAt } = await issueInvite({
    email: args.email,
    organizationId: args.organizationId,
    role: args.role,
    issuedByUserId: issuerUserId,
    baseUrl: args.baseUrl,
    brandName: args.brandName,
    ttlSeconds: args.ttlSeconds,
  })

  console.log("")
  console.log("Invite issued + emailed:")
  console.log("  invite_id:    ", inviteId)
  console.log("  email:        ", args.email)
  console.log("  organization: ", args.organizationId)
  console.log("  role:         ", args.role)
  console.log("  issued_by:    ", issuerUserId ?? "(none)")
  console.log("  expires_at:   ", expiresAt.toISOString())
  console.log("  revoked_prior:", revoked)
  console.log("")
  console.log("Link (also sent to the recipient by email):")
  console.log(url)
  console.log("")
  console.log(
    "Email transport: " +
      (process.env.RESEND_API_KEY
        ? "Resend"
        : process.env.AWS_REGION
          ? "SES v2"
          : "Console (logs to stdout — see your dev-server console)"),
  )
  console.log("")
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err))
  process.exit(1)
})
