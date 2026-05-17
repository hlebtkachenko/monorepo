import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { admin, magicLink, twoFactor } from "better-auth/plugins"
import { db } from "@workspace/db/client"
import * as schema from "@workspace/db/schema"
import {
  sendEmail,
  passwordResetEmail,
  verifyEmailEmail,
  magicLinkEmail,
} from "@workspace/email"

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
          "Set it to the deployed origin (e.g. https://staging.afframe.com).",
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
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      await sendEmail(verifyEmailEmail({ to: user.email, url }))
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
  },
  plugins: [
    admin(),
    twoFactor({
      // Issuer surfaced in the authenticator app row (e.g. "Afframe
      // (alice@hapd.cz)"). Without this BA defaults to "Better Auth".
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
