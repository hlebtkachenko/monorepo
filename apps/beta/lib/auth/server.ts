import "server-only"

import { randomBytes } from "node:crypto"
import { betterAuth } from "better-auth"
import { APIError } from "better-auth/api"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { nextCookies } from "better-auth/next-js"
import { twoFactor } from "better-auth/plugins/two-factor"
import { eq } from "drizzle-orm"

import { betaDb } from "@/db/client"
import {
  app_user,
  auth_account,
  auth_session,
  auth_verification,
  two_factor,
} from "@/db/schema"

import {
  BETA_COOKIE_ATTRIBUTES,
  BETA_COOKIE_NAMES,
  BETA_COOKIE_PREFIX,
  BETA_RATE_LIMIT_MAX,
  BETA_RATE_LIMIT_RULES,
  BETA_RATE_LIMIT_WINDOW_SECONDS,
  BETA_SESSION_EXPIRES_IN_SECONDS,
  BETA_SESSION_UPDATE_AGE_SECONDS,
  BETA_TOTP_ISSUER,
  BETA_TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
} from "./policy"

/**
 * The beta portal's OWN Better Auth instance.
 *
 * It shares nothing with `@workspace/auth` — not the database, not the secret,
 * not the cookie namespace. That separation is the whole point (plan Part 1
 * addendum): the main product signs a session cookie for `.afframe.com`, which
 * physically reaches `beta.afframe.com`, and a shared instance would also mean
 * a shared identity store and a `packages/db` coupling. Never import
 * `@workspace/auth` from this app.
 *
 * PINNED to better-auth 1.6.13 — the exact version the workspace forces in
 * `pnpm-workspace.yaml overrides`. That pin is deliberate and auth-critical;
 * 1.6.14 drags in `@better-auth/kysely-adapter` 1.6.14, which imports a symbol
 * kysely 0.29.2 does not export and breaks the Turbopack build. Bump only
 * deliberately, in lockstep across the workspace, with a re-run of this app's
 * build.
 *
 * WHAT IS DELIBERATELY ABSENT
 *   - Sign-up. `disableSignUp` is unconditional: the ONLY way an account comes
 *     into existence is a one-time `user_setup_token` link (`setup-token.ts`).
 *     Note this also blocks server-side `auth.api.signUpEmail` — Advisor
 *     blocker B4-1 — which is why the consume path builds the user through
 *     `$context.internalAdapter` instead.
 *   - Email. No `sendResetPassword`, no `sendVerificationEmail`, no
 *     `requireEmailVerification`. Beta sends no mail yet: setup links are handed
 *     out by the office through /admin (PR 08). A verification hook here would
 *     be a hook with nothing behind it.
 *   - `crossSubDomainCookies`. Setting it would hand beta's session to every
 *     `*.afframe.com` host. See `policy.ts` for the full cookie rationale.
 *   - Any middleware cookie peek. The portal gate is a server-side
 *     `getSession()` that reads the database (`session.ts`).
 */

const IS_PROD = process.env.NODE_ENV === "production"

/**
 * `next build` evaluates route modules with NODE_ENV=production and none of the
 * runtime secrets present, so the build needs SOME secret to construct the
 * instance with.
 *
 * It is 32 CSPRNG bytes generated per process, never a literal. A constant —
 * even an obviously-fake one — is baked into the image, and anything baked into
 * an image is a key an attacker can read out of it; if such a build ever booted
 * without BETTER_AUTH_SECRET (a bad task definition, a local `next start`), it
 * would mint sessions signed with a publicly-known value. This one is unknowable
 * outside the process and dies with it: a token signed under it verifies
 * nowhere, including in the next process, which is the failure mode we want.
 */
const IS_BUILD = process.env["NEXT_PHASE"] === "phase-production-build"
const BUILD_PLACEHOLDER_SECRET = randomBytes(32).toString("hex")
const MIN_SECRET_BYTES = 32

/**
 * Never logged, never echoed, never derived from a request. Rotating it
 * invalidates every live session and every signed cookie in the environment —
 * that is a deliberate operator action, not a deploy-time side effect, so the
 * value lives in SSM (`/monorepo/beta/better-auth-secret`) and reaches the task
 * as a secret, never as a task-definition environment variable.
 */
function readSecret(): string {
  const raw = process.env["BETTER_AUTH_SECRET"]
  if (!raw) {
    if (IS_BUILD) return BUILD_PLACEHOLDER_SECRET
    throw new Error(
      "BETTER_AUTH_SECRET is not set. Provide a 32+ byte random secret (SSM in " +
        "the deployed environment, .env locally).",
    )
  }
  if (new TextEncoder().encode(raw).byteLength < MIN_SECRET_BYTES) {
    throw new Error(
      `BETTER_AUTH_SECRET must be at least ${MIN_SECRET_BYTES} bytes.`,
    )
  }
  return raw
}

/**
 * ENV-FIRST, never request-derived. Behind the Cloudflare Tunnel a request's
 * own URL is the container listener (`0.0.0.0:3000`), so anything built from it
 * emits links to an address that does not exist off-box (ADR-0008 amendment 2).
 * `BETTER_AUTH_URL` is set by the CDK app stack to `https://<beta domain>`.
 */
function readBaseUrl(): string | undefined {
  const raw = process.env["BETTER_AUTH_URL"]?.trim()
  if (raw) return raw
  if (IS_BUILD) return undefined
  if (IS_PROD) {
    throw new Error(
      "BETTER_AUTH_URL is required in production (cookie scope + absolute links).",
    )
  }
  // Dev: Better Auth infers the origin per request, which is correct on
  // localhost where there is no proxy in front.
  return undefined
}

function readTrustedOrigins(): string[] {
  const raw = process.env["BETTER_AUTH_TRUSTED_ORIGINS"]
  if (!raw) return []
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
}

function createBetaAuth() {
  const db = betaDb()

  return betterAuth({
    appName: "afframe-beta",
    database: drizzleAdapter(db, {
      provider: "pg",
      // Beta's tables are snake_case, so every Better Auth model needs an
      // explicit table + field remap. The contract is written out in
      // `db/schema/auth.ts`; this is its other half. A missing entry does not
      // fail at boot — it fails at runtime with "column does not exist".
      //
      // Both key sets are present on purpose: the adapter resolves a table by
      // its `modelName` (`app_user`), while parts of Better Auth still address
      // models by their canonical name (`user`). The main app carries the same
      // pair (packages/auth/src/server.ts:260-270).
      schema: {
        app_user,
        auth_session,
        auth_account,
        auth_verification,
        two_factor,
        user: app_user,
        session: auth_session,
        account: auth_account,
        verification: auth_verification,
        // Both spellings again: the plugin addresses the model as `twoFactor`,
        // the adapter resolves it by the `modelName` given in the plugin's
        // `schema` option below.
        twoFactor: two_factor,
      },
    }),
    secret: readSecret(),
    baseURL: readBaseUrl(),
    trustedOrigins: readTrustedOrigins(),
    user: {
      modelName: "app_user",
      fields: {
        emailVerified: "email_verified",
        twoFactorEnabled: "two_factor_enabled",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
    },
    session: {
      modelName: "auth_session",
      fields: {
        userId: "user_id",
        expiresAt: "expires_at",
        ipAddress: "ip_address",
        userAgent: "user_agent",
        createdAt: "created_at",
        updatedAt: "updated_at",
      },
      expiresIn: BETA_SESSION_EXPIRES_IN_SECONDS,
      updateAge: BETA_SESSION_UPDATE_AGE_SECONDS,
      // Load-bearing: with the cookie cache on, a revoked session keeps working
      // until the cached copy expires. Off means revocation lands on the next
      // request.
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
      // UNCONDITIONAL. Not env-driven, not "off in dev" — beta has no public
      // registration surface in any environment.
      disableSignUp: true,
      // Matches @workspace/shared PasswordSchema, which the forms validate
      // against, so a rejected password fails at the form with a Czech message
      // instead of as an opaque endpoint error.
      minPasswordLength: 12,
      maxPasswordLength: 128,
    },
    databaseHooks: {
      session: {
        create: {
          /**
           * The single choke point for "may this identity get a session". Every
           * path that mints one — the sign-in endpoint and the setup-link
           * consume — goes through here, so a deactivated user cannot be
           * re-admitted by any of them.
           *
           * Deactivation is a soft delete (`app_user.disabled_at`, spec §3.5): a
           * leaver still needs their last payslip, so the row and its documents
           * stay. Without this check, "deactivated" would only mean "cannot sign
           * up again".
           */
          before: async (session) => {
            const [user] = await db
              .select({ disabled_at: app_user.disabled_at })
              .from(app_user)
              .where(eq(app_user.id, session.userId))
              .limit(1)

            if (!user || user.disabled_at !== null) {
              throw new APIError("UNAUTHORIZED", {
                message: "Účet je deaktivovaný.",
              })
            }
            return { data: session }
          },
        },
      },
    },
    rateLimit: {
      // Explicit, not inherited. Better Auth's default is
      // `enabled: isProduction`, which would silently leave every non-prod
      // deployment (and every test asserting the limiter) unlimited.
      enabled: true,
      window: BETA_RATE_LIMIT_WINDOW_SECONDS,
      max: BETA_RATE_LIMIT_MAX,
      // In-memory is correct here and not a shortcut: one Fargate task holds
      // the whole counter (plan Part 1, desiredCount 1). Database storage would
      // need a rate-limit table that `db/schema/auth.ts` deliberately omits.
      storage: "memory",
      customRules: { ...BETA_RATE_LIMIT_RULES },
    },
    advanced: {
      cookiePrefix: BETA_COOKIE_PREFIX,
      // Better Auth prepends `__Secure-` to every cookie name when it decides
      // cookies are secure. We name the cookies `__Host-...` ourselves (a
      // strictly stronger prefix that Better Auth cannot express), so its own
      // prefixing has to be switched off or the emitted name would be
      // `__Secure-__Host-...` — a name no browser gives prefix semantics to.
      // The `Secure` attribute that `__Host-` requires comes back through
      // `defaultCookieAttributes` below.
      useSecureCookies: false,
      cookies: {
        session_token: { name: BETA_COOKIE_NAMES.session_token },
        session_data: { name: BETA_COOKIE_NAMES.session_data },
        dont_remember: { name: BETA_COOKIE_NAMES.dont_remember },
        account_data: { name: BETA_COOKIE_NAMES.account_data },
        // The twoFactor() plugin's own cookies. Better Auth composes plugin
        // cookie names through the same `createAuthCookie` getter, which honours
        // an override for any key — so these land in the `__Host-` namespace
        // like the core four, instead of the bare `beta-auth.` prefix.
        two_factor: { name: BETA_COOKIE_NAMES.two_factor },
        trust_device: { name: BETA_COOKIE_NAMES.trust_device },
      },
      defaultCookieAttributes: { ...BETA_COOKIE_ATTRIBUTES },
      database: {
        // Every primary key in this schema is a `uuid` column. Better Auth
        // generates ids TypeScript-side before handing rows to Drizzle, so its
        // generator has to emit UUIDs or the insert fails on type.
        generateId: "uuid",
      },
      // Rate-limit key + `auth_session.ip_address` source. See `request-ip.ts`
      // for why this is `cf-connecting-ip` alone.
      ipAddress: { ipAddressHeaders: ["cf-connecting-ip"] },
    },
    plugins: [
      /**
       * TOTP, and TOTP only (PR 21, spec §2.10 "Účet: 2FA (forced for owner)").
       *
       * The plugin ships three second factors and beta enables one. `otp` needs
       * a `sendOTP` transport and beta sends no mail (see WHAT IS DELIBERATELY
       * ABSENT above), so leaving it unconfigured is what keeps it off — it is
       * only advertised when `otpOptions.sendOTP` exists. Backup codes come
       * along with the plugin and are the answer to a lost phone, which an
       * office of this size otherwise resolves by an operator resetting the
       * factor out of band.
       *
       * `skipVerificationOnEnable` is NOT set. The default two-step enrolment
       * (generate, then prove a code before the factor counts) is the whole
       * point: skipping it enrolls a user against a secret they may have failed
       * to store, and the next sign-in is the first time anyone finds out.
       *
       * The `schema` block is the plugin's half of the snake_case contract in
       * `db/schema/auth.ts`. `secret` and `verified` need no entry — the field
       * name and the column name already agree.
       *
       * `user.fields.twoFactorEnabled` HAS to be repeated here even though the
       * top-level `user` block above already maps it. A plugin's fields are
       * merged through `mergeSchema(pluginSchema, pluginOptions.schema)`
       * (better-auth 1.6.13, `dist/db/schema.mjs`), which reads the PLUGIN's own
       * `schema` option and never the root `user.fields` — so without this entry
       * the column resolves as `twoFactorEnabled` and the Drizzle adapter throws
       * `The field "twoFactorEnabled" does not exist in the "app_user" Drizzle
       * schema` on the first enrolment. Verified by the lifecycle test.
       */
      twoFactor({
        issuer: BETA_TOTP_ISSUER,
        twoFactorCookieMaxAge: BETA_TWO_FACTOR_COOKIE_MAX_AGE_SECONDS,
        schema: {
          user: { fields: { twoFactorEnabled: "two_factor_enabled" } },
          twoFactor: {
            modelName: "two_factor",
            fields: { userId: "user_id", backupCodes: "backup_codes" },
          },
        },
      }),
      // MUST stay last in the chain: it forwards Better Auth's Set-Cookie into
      // Next's cookie store so Server Actions that sign a user in actually
      // establish the session.
      nextCookies(),
    ],
  })
}

export type BetaAuth = ReturnType<typeof createBetaAuth>

let cached: BetaAuth | undefined

/**
 * Lazily built, like `betaDb()`. A module-level instance would be constructed
 * during `next build`, where neither DATABASE_URL nor BETTER_AUTH_SECRET is
 * real.
 */
export function betaAuth(): BetaAuth {
  cached ??= createBetaAuth()
  return cached
}
