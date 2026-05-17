# @workspace/shared

Cross-cutting domain types and validation schemas shared between app packages, the UI package, and server logic. Zero server-only or client-only dependencies — safe to import anywhere.

## Entry points

```ts
// Brand identity constants (logo path, i18n keys, placeholder logo names)
import { BRAND, AUTH_ASIDE_LOGOS, type Brand } from "@workspace/shared"

// Auth-flow Zod schemas + validation utilities
import {
  LoginEmailSchema,
  LoginPasswordSchema,
  OTPSchema,
  ForgotPasswordSchema,
  ResetPasswordSchema,
  WorkspaceSchema,
  ProfileSchema,
  PlanSchema,
  ExperienceSchema,
  InviteListSchema,
  PasswordSchema,
  PASSWORD_RULES,
} from "@workspace/shared/auth"
```

## What it does

- `BRAND` — product name i18n key, tagline key, and logo asset path. Never contains hardcoded product-name strings; those stay in `messages/*.json`.
- `AUTH_ASIDE_LOGOS` — placeholder customer-logo names shown on auth/onboarding side panels.
- `@workspace/shared/auth` — Zod schemas for every auth and onboarding form, password-strength rules, onboarding step resolver, and related TypeScript types.

## Constraints

- No server-only imports (`@workspace/db`, Node built-ins, etc.).
- No client-only imports (React, browser APIs).
- Zod is imported directly in each consumer — `z` is not re-exported from this package.
