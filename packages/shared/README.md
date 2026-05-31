# @workspace/shared

Cross-cutting domain types and validation schemas shared between app packages, the UI package, and server logic. Zero server-only or client-only dependencies — safe to import anywhere.

## Entry points

```ts
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

Brand surface (Logo, BrandName, urls, emails, placeholder partner names)
lives in `@workspace/ui/brand-assets`, not here.

## What it does

- `@workspace/shared/auth` — Zod schemas for every auth and onboarding form, password-strength rules, onboarding step resolver, and related TypeScript types.

## Constraints

- No server-only imports (`@workspace/db`, Node built-ins, etc.).
- No client-only imports (React, browser APIs).
- Zod is imported directly in each consumer — `z` is not re-exported from this package.
