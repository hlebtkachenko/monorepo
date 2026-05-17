# @workspace/auth

Authentication layer built on [Better Auth](https://better-auth.com). Owns global user identity — who the user is — but not multi-tenant membership, which is domain logic in `@workspace/db`.

## Entry points

```ts
// JWT tokens — cross-cutting; safe in both server and browser environments
import { signSignupToken, verifySignupToken, type SignupClaims } from "@workspace/auth"
import { signInviteToken, verifyInviteToken } from "@workspace/auth"

// Better Auth server instance (Node only — imports DB + email transports)
import { auth, resolveBaseURL, type Auth } from "@workspace/auth/server"

// Better Auth React client (browser only)
import { authClient, signIn, signOut, useSession, twoFactor } from "@workspace/auth/client"

// All JWT sign/verify helpers grouped
import * from "@workspace/auth/tokens"

// Invite-code generation and verification
import { issueInvite } from "@workspace/auth/invite-issuer"

// Runtime env variable helpers
import { env } from "@workspace/auth/env"

// Test fixtures — Vitest only, never import in production code
import { seedLoginableUser } from "@workspace/auth/test-support"
```

## What it does

- Configures Better Auth with the Drizzle adapter, mapping BA's camelCase vocabulary to the repo's snake_case Postgres columns.
- Enables email+password, magic-link, 2FA (TOTP), and admin plugins.
- JWT tokens (`jose`) cover invite links, onboarding state, signup, and active-workspace context — signed with `BETTER_AUTH_SECRET`.
- `resolveBaseURL()` builds the absolute redirect origin, with dev/prod/build-phase guards.

## Design references

- ADR-0010 — Multi-tenant RLS (workspace + organization tiers)
- ADR-0018 — Three-layer authz
