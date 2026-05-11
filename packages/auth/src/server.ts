import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { admin, twoFactor } from "better-auth/plugins"
import { db } from "@workspace/db/client"
import * as schema from "@workspace/db/schema"
import {
  sendEmail,
  passwordResetEmail,
  verifyEmailEmail,
} from "@workspace/email"

/**
 * Better Auth server instance.
 *
 * Owns global identity: WHO the user is. Multi-tenant membership
 * (`workspace_membership`, `organization_membership`) is OUR domain logic
 * and lives outside Better Auth.
 *
 * Tables are mapped to our snake_case names via the `schema` option:
 *   user         -> app_user
 *   session      -> auth_session
 *   account      -> auth_account
 *   verification -> auth_verification
 *   twoFactor    -> two_factor
 */
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
  secret: process.env.BETTER_AUTH_SECRET,
  baseURL: process.env.BETTER_AUTH_URL,
  trustedOrigins: process.env.BETTER_AUTH_TRUSTED_ORIGINS?.split(",") ?? [],
  emailAndPassword: {
    enabled: true,
    autoSignIn: false,
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
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24, // 1 day rolling
    cookieCache: { enabled: true, maxAge: 60 * 5 },
  },
  plugins: [admin(), twoFactor()],
})

export type Auth = typeof auth
