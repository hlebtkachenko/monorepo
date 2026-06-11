import { betterAuth } from "better-auth"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { admin, magicLink, twoFactor } from "better-auth/plugins"
import { db } from "@workspace/db/client"
import * as schema from "@workspace/db/schema"
import { writeAuditEventGlobal } from "@workspace/db"
import {
  sendEmail,
  passwordResetEmail,
  verifyEmailEmail,
  magicLinkEmail,
} from "@workspace/email"
import { truncateIp, hashUserAgent } from "./tokens/auth-token"

// ---------------------------------------------------------------------------
// Better Auth version assertion (ADR-0022 / C2).
//
// Path strings in hooks.after are matched against this exact BA minor. If
// Dependabot bumps the minor, audit coverage silently breaks. Review the
// path-to-action mapping below on any `better-auth` minor-version change and
// update this constant accordingly.
// ---------------------------------------------------------------------------
// This constant documents the BA minor against which the hooks.after path
// mapping below was authored. On every Dependabot bump of `better-auth`,
// review the path-to-action switch in `resolveAuditAction` and update this
// constant. The package.json pin enforces the exact minor at install time.
//
// NOTE: declared as exported so TypeScript strict mode does not flag it unused.
// Callers must not import it — it is not part of the public API.
export const _AUDIT_BA_MINOR = "1.6" // better-auth@1.6.x

/**
 * Map a Better Auth endpoint path to a canonical audit action name, plus
 * whether the event signals a failure (based on ctx.context.returned being an
 * error Response or APIError).
 *
 * Returns null for paths we do not audit.
 */
export function resolveAuditAction(
  path: string,
  succeeded: boolean,
): string | null {
  switch (path) {
    case "/sign-in/email":
      return succeeded ? "auth.login.success" : "auth.login.failed_password"
    case "/sign-up/email":
      return succeeded ? "auth.signup.success" : "auth.signup.failed"
    case "/two-factor/verify-totp":
      return succeeded ? "auth.mfa.success_totp" : "auth.mfa.failed_totp"
    case "/two-factor/verify-backup":
      return succeeded ? "auth.mfa.success_backup" : "auth.mfa.failed_backup"
    case "/sign-out":
      return "auth.signout"
    case "/forget-password":
      return "auth.password_reset.requested"
    case "/reset-password":
      return "auth.password_reset.completed"
    case "/magic-link/send":
      return "auth.magic_link.issued"
    case "/magic-link/sign-in":
      return succeeded ? "auth.magic_link.consumed" : "auth.magic_link.failed"
    default:
      return null
  }
}

/**
 * Resolve the client IP for audit events. Cloudflare always overwrites
 * `cf-connecting-ip` with the true connecting address, so it wins. Without
 * it (local dev, direct hits) fall back to the LAST `x-forwarded-for` hop —
 * the first hop is client-supplied and spoofable behind Cloudflare, which
 * appends the real IP to any inbound XFF list. A multi-hop list previously
 * went raw into `truncateIp`, which returns null for any comma list, so
 * spoofed XFF nulled the audit-trail IP entirely (F-5).
 */
export function resolveAuditIp(headers: Headers): string | null {
  const cf = headers.get("cf-connecting-ip")
  if (cf) return cf
  const xff = headers.get("x-forwarded-for")
  if (!xff) return null
  const hops = xff.split(",")
  return hops[hops.length - 1]?.trim() || null
}

/**
 * Determine whether a Better Auth `hooks.after` ctx response succeeded.
 * A missing returned value or an APIError/non-200 Response = failure.
 */
export function isSuccess(returned: unknown): boolean {
  if (returned == null) return false
  if (returned instanceof Response) return returned.status === 200
  if (returned instanceof APIError) return false
  // Structural fallback for error-like objects that dodge the instanceof
  // (duplicated better-call install): better-call's APIError carries the
  // HTTP status NAME in `status` ("UNAUTHORIZED") and the number in
  // `statusCode` — a `typeof status === "number"` probe alone misses it,
  // which silently audited every failed login as success (T2 tripwire).
  if (typeof returned === "object") {
    const { statusCode, status } = returned as {
      statusCode?: unknown
      status?: unknown
    }
    if (typeof statusCode === "number") return statusCode < 400
    if (typeof status === "number") return status < 400
  }
  return true
}

/**
 * Resolve the absolute base URL Better Auth uses for cookie domain, magic
 * link / password-reset / email-verification redirects, and trusted-origin
 * checks.
 *
 * Production (NODE_ENV=production): `BETTER_AUTH_URL` is required. Missing
 * → throw at module load so a misconfigured deploy fails fast instead of
 * silently emitting localhost links into customer inboxes.
 *
 * Dev: when the env var is absent we fall back to `http://localhost:${PORT}`
 * so `pnpm --filter web dev` on a non-3000 port still produces working
 * magic-link / password-reset URLs without any extra setup.
 *
 * Dev-with-explicit-URL-but-different-port: if `BETTER_AUTH_URL` is set to
 * `http://localhost:3000` but `PORT` says otherwise (e.g. PORT=3010 because
 * 3000 is taken), rewrite the port. Keeps the dev override path simple.
 */
export function resolveBaseURL(): string {
  const explicit = process.env.BETTER_AUTH_URL
  const port = process.env.PORT
  if (!explicit) {
    // Next.js build phase needs a value for static analysis but won't
    // actually emit URLs — return a placeholder. The runtime guard below
    // catches real production requests with no BETTER_AUTH_URL.
    if (process.env.NEXT_PHASE === "phase-production-build") {
      return "http://build-time-placeholder.invalid"
    }
    if (process.env.NODE_ENV === "production") {
      throw new Error(
        "BETTER_AUTH_URL must be set in production. " +
          "Set it to the deployed origin (e.g. https://app-staging.afframe.com).",
      )
    }
    return `http://localhost:${port ?? "3000"}`
  }
  if (port && explicit.includes("localhost")) {
    return explicit.replace(/:\d+/, `:${port}`)
  }
  return explicit
}

/**
 * Better Auth server instance.
 *
 * Owns global identity: WHO the user is. Multi-tenant membership
 * (`workspace_membership`, `organization_membership`) is OUR domain logic
 * and lives outside Better Auth.
 *
 * Drizzle table names are mapped via `schema`:
 *   user         -> app_user
 *   session      -> auth_session
 *   account      -> auth_account
 *   verification -> auth_verification
 *   twoFactor    -> two_factor
 *
 * Drizzle column conventions in @workspace/db are snake_case (matching
 * lac). Better Auth expects camelCase field identifiers in its own model
 * vocabulary, so each model's `fields` block remaps every BA-known field
 * to the snake_case Drizzle column. New BA versions that introduce more
 * fields will require this list to be extended; the BA migrate command
 * surfaces missing mappings explicitly.
 */
const IS_PROD = process.env.NODE_ENV === "production"
const MIN_BA_SECRET_BYTES = 32
// Next.js sets NEXT_PHASE to phase-production-build while pre-rendering
// pages and collecting page data. Module evaluation runs in that phase
// with NODE_ENV=production but BETTER_AUTH_SECRET unavailable. The
// deployed container re-evaluates this module at boot with the real env
// set, where the strict checks below fire.
const IS_BUILD = process.env.NEXT_PHASE === "phase-production-build"
// Long, clearly-fake placeholder used only during next build. If this
// value ever leaks into a runtime auth flow, Better Auth signature
// checks will fail uniformly — failure-open is impossible.
const BUILD_PLACEHOLDER_SECRET = "build-time-placeholder-" + "x".repeat(40)

function readBetterAuthSecret(): string {
  const raw = process.env.BETTER_AUTH_SECRET
  if (!raw) {
    if (IS_BUILD) return BUILD_PLACEHOLDER_SECRET
    if (IS_PROD) {
      throw new Error(
        "BETTER_AUTH_SECRET is required in production. Set a 32+ byte random secret.",
      )
    }
    // Dev fallback: still require at least a non-empty value so we never
    // fall through to Better Auth's hard-coded development default.
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Provide a 32+ byte random secret even in development.",
    )
  }
  if (new TextEncoder().encode(raw).byteLength < MIN_BA_SECRET_BYTES) {
    throw new Error(
      `BETTER_AUTH_SECRET must be at least ${MIN_BA_SECRET_BYTES} bytes.`,
    )
  }
  return raw
}

function readBetterAuthBaseUrl(): string | undefined {
  const raw = process.env.BETTER_AUTH_URL?.trim()
  if (raw) return raw
  if (IS_BUILD) return undefined
  if (IS_PROD) {
    throw new Error(
      "BETTER_AUTH_URL is required in production (used for absolute reset/verification links).",
    )
  }
  return undefined
}

function readTrustedOrigins(): string[] {
  const raw = process.env.BETTER_AUTH_TRUSTED_ORIGINS
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      ...schema,
      user: schema.app_user,
      session: schema.auth_session,
      account: schema.auth_account,
      verification: schema.auth_verification,
      twoFactor: schema.two_factor,
    },
  }),
  secret: readBetterAuthSecret(),
  baseURL: readBetterAuthBaseUrl(),
  trustedOrigins: readTrustedOrigins(),
  user: {
    modelName: "app_user",
    fields: {
      emailVerified: "email_verified",
      createdAt: "created_at",
      updatedAt: "updated_at",
      banReason: "ban_reason",
      banExpires: "ban_expires",
      twoFactorEnabled: "two_factor_enabled",
    },
    additionalFields: {
      // Surface app_user.locale on session.user so RSC + middleware can
      // resolve the i18n locale without an extra DB round-trip.
      locale: {
        type: "string",
        required: false,
        defaultValue: "en",
        input: false,
      },
      timezone: {
        type: "string",
        required: false,
        defaultValue: "UTC",
        input: false,
      },
    },
  },
  session: {
    modelName: "auth_session",
    fields: {
      userId: "user_id",
      expiresAt: "expires_at",
      ipAddress: "ip_address",
      userAgent: "user_agent",
      impersonatedBy: "impersonated_by",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day rolling
    // cookieCache disabled: BA's session-cookie-cache refresh triggers a
    // cookies().set() during `getSession()` reads. Server Components
    // (e.g. /onboarding/* page files) cannot write cookies — that throws
    // "Cookies can only be modified in a Server Action or Route Handler".
    // Tradeoff: one extra DB roundtrip per session read. Re-enable only
    // if every getSession() call site moves into actions / route
    // handlers, or if BA gains a "skip refresh in RSC" knob.
    cookieCache: { enabled: false },
  },
  account: {
    modelName: "auth_account",
    fields: {
      userId: "user_id",
      accountId: "account_id",
      providerId: "provider_id",
      accessToken: "access_token",
      refreshToken: "refresh_token",
      idToken: "id_token",
      accessTokenExpiresAt: "access_token_expires_at",
      refreshTokenExpiresAt: "refresh_token_expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  verification: {
    modelName: "auth_verification",
    fields: {
      expiresAt: "expires_at",
      createdAt: "created_at",
      updatedAt: "updated_at",
    },
  },
  emailAndPassword: {
    enabled: true,
    // Surface-level sign-up kill switch (A-5). The admin container sets
    // AUTH_DISABLE_SIGNUP=1 (apps/admin/Dockerfile) so its BA catchall
    // rejects /sign-up/email — the admin origin must never register
    // accounts. The web container leaves it unset: the token-gated signup
    // flow calls auth.api.signUpEmail and must keep working.
    disableSignUp: process.env.AUTH_DISABLE_SIGNUP === "1",
    // autoSignIn issues a session on signUpEmail and (via the nextCookies
    // plugin below) pipes the Set-Cookie through Next's cookies() store
    // automatically. The onboarding password action used to call
    // signInEmail manually after signUpEmail — that path didn't forward
    // the cookie reliably in server actions and was the cause of HI-6
    // in PHASE_REVIEW.md (infinite redirect from /onboarding/workspace
    // back to /onboarding/password because the session cookie was lost).
    autoSignIn: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    sendResetPassword: async ({ user, url }) => {
      await sendEmail(passwordResetEmail({ to: user.email, url }))
    },
    // The password-reset flow exists because the password may be known to
    // someone else — leaving their sessions alive for up to 30 days defeats
    // it (F-2; BA default is false).
    revokeSessionsOnPasswordReset: true,
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verifyEmailEmail({ to: user.email, url }))
    },
  },
  // Explicit rate-limit posture (F-3). BA's default already gates on
  // NODE_ENV=production; the extra AUTH_TOKEN_ENV check keeps the limiter
  // OFF for the e2e suite, which runs `next start` (NODE_ENV=production)
  // with AUTH_TOKEN_ENV=dev (apps/web/playwright.config.ts). Deployed
  // containers set AUTH_TOKEN_ENV=stg|prd (infra/cdk/lib/app-stack.ts).
  // Defaults kept: window 10 s, max 100, memory storage — per-task counters
  // on Fargate (limit multiplies by task count, resets on restart);
  // accepted until Redis/secondaryStorage lands. BA's built-in special
  // rules (3/10 s sign-in/up, 3/60 s reset) stay active; customRules wins
  // over them and closes the TOTP/backup brute-force window — those paths
  // otherwise fall in the generic 100/10 s bucket.
  rateLimit: {
    enabled: IS_PROD && process.env.AUTH_TOKEN_ENV !== "dev",
    customRules: {
      "/two-factor/*": { window: 60, max: 3 },
    },
  },
  advanced: {
    database: {
      // Schema declares uuid for every BA-managed primary key + FK; main
      // uses uuidv7() at insert time. Force BA's TS-side ID generator to
      // UUID so the type matches when BA generates the value before
      // delegating to Drizzle.
      generateId: "uuid",
    },
    // Rate-limit key + session ip_address source (F-5). BA's default is
    // x-forwarded-for FIRST hop — client-controlled behind Cloudflare
    // (CF appends the real IP to any inbound XFF list), so an attacker
    // could rotate fake first-hop IPs to evade the sign-in limiter.
    // `cf-connecting-ip` is always overwritten by Cloudflare. Verified
    // fallback in BA 1.6.11 (utils/get-request-ip.mjs): header absent →
    // 127.0.0.1 in dev/test, null in production (rate limiting skipped
    // with a one-time logger warning, session ip stays null).
    ipAddress: {
      ipAddressHeaders: ["cf-connecting-ip"],
    },
    // Cross-subdomain cookies. The session cookie needs to be readable
    // from `app.`, `admin.`, and `api.afframe.com` (web, admin, and any
    // future api-side admin-gated routes). A leading-dot domain covers
    // every subdomain.
    //
    // The block is enabled only when `BETTER_AUTH_COOKIE_DOMAIN` is set —
    // local dev on `localhost` still gets a host-only cookie. CI / staging
    // / production set the value to `.afframe.com` via the deploy
    // workflow's env block (`packages/auth/src/server.ts` reads it here).
    ...(process.env.BETTER_AUTH_COOKIE_DOMAIN
      ? {
          crossSubDomainCookies: {
            enabled: true,
            domain: process.env.BETTER_AUTH_COOKIE_DOMAIN,
          },
          defaultCookieAttributes: {
            sameSite: "lax" as const,
            secure: true,
            httpOnly: true,
          },
        }
      : {}),
  },
  hooks: {
    // Capture auth events after each BA endpoint response. Path strings are
    // pinned to BA minor _AUDIT_BA_MINOR — review on every Dependabot bump.
    after: createAuthMiddleware(async (ctx) => {
      const path = ctx.path
      if (!path) return
      const returned = ctx.context.returned
      const succeeded = isSuccess(returned)
      const action = resolveAuditAction(path, succeeded)
      if (!action) return

      const rawIp =
        ctx.request instanceof Request
          ? resolveAuditIp(ctx.request.headers)
          : null
      const rawUa =
        ctx.request instanceof Request
          ? (ctx.request.headers.get("user-agent") ?? null)
          : null

      const ip = truncateIp(rawIp)
      const ua = hashUserAgent(rawUa)

      // Extract user_id from the BA session if one was just created.
      const userId =
        ctx.context.newSession?.user?.id ??
        ctx.context.session?.user?.id ??
        null

      // All auth events are global-tier: no workspace binding exists at this
      // hook level. writeAuditEventGlobal inserts with workspace_id = NULL
      // when workspaceId is absent (nullable since migration 0021 / AFF-208),
      // so pre-account events (failed logins for unknown users) ARE persisted;
      // tenant-bound RLS policies exclude NULL rows, so only withAdminBypass
      // reads can see them. writeAuditEventGlobal never throws into the auth
      // flow.
      await writeAuditEventGlobal({
        actorUserId: userId,
        action,
        payload: {
          ...(ip ? { ip } : {}),
          ...(ua ? { ua } : {}),
          path,
        },
      })
    }),
  },
  plugins: [
    admin(),
    twoFactor({
      // Issuer surfaced in the authenticator app row (e.g. "Afframe
      // (you@example.com)"). Without this BA defaults to "Better Auth".
      issuer: "Afframe",
      // BA plugin core treats field names as camelCase (backupCodes, userId).
      // Our Drizzle table exposes snake_case JS keys (backup_codes, user_id)
      // matching the SQL columns. Remap so the adapter's `schema[fieldName]`
      // lookup hits the right Drizzle column object.
      schema: {
        twoFactor: {
          fields: {
            backupCodes: "backup_codes",
            userId: "user_id",
          },
        },
        user: {
          fields: {
            twoFactorEnabled: "two_factor_enabled",
          },
        },
      },
    }),
    magicLink({
      sendMagicLink: async ({ email, url }) => {
        await sendEmail(magicLinkEmail({ to: email, url }))
      },
      // Product signup is token-gated (afkey-sig flow); without this a
      // magic link for an unknown email CREATES the account on click —
      // an open-registration bypass (F-4). Verified in BA 1.6.11: the
      // gate fires at /magic-link/verify (redirects with
      // error=new_user_signup_disabled); the send endpoint still returns
      // a uniform {status:true} and sends the email regardless of
      // account existence, so the login UI's "check your email" copy
      // stays truthful and account existence is not enumerable.
      disableSignUp: true,
    }),
    // MUST be last in the plugin chain (per Better Auth docs). nextCookies
    // hooks into outgoing responses and forwards the Set-Cookie BA emits
    // through Next's cookies() store, so server actions that call
    // signUpEmail / signInEmail establish the session on the browser
    // without manual cookie plumbing.
    nextCookies(),
  ],
})

export type Auth = typeof auth
