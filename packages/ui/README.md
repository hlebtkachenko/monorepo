# @workspace/ui

Shared React component library: shadcn/ui primitives + custom components, Storybook stories, and Vitest tests. Consumed source-first (no build step) by `apps/web` and `apps/admin`.

## Entry points

```ts
// Components (one subpath per component)
import { Button, type ButtonProps } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import { DataTable } from "@workspace/ui/components/data-table"
// ... all components follow the same pattern

// Blocks (larger composed regions)
import { AuthAside } from "@workspace/ui/blocks/auth-aside"
import { AuthShell } from "@workspace/ui/blocks/auth-shell"

// Brand surface — Logo, brand text, urls, emails. See src/brand-assets/README.md
import {
  Logo,
  BrandName,
  BrandTagline,
  BRAND_SUPPORT_EMAIL,
} from "@workspace/ui/brand-assets"
import { getBrandText } from "@workspace/ui/brand-assets/server"

// Utilities
import { cn } from "@workspace/ui/lib/utils"
import { formatNumber } from "@workspace/ui/lib/format-number"

// Hooks
import { useIsMobile } from "@workspace/ui/hooks/use-mobile"
import { useStatefulButton } from "@workspace/ui/hooks/use-stateful-button"

// Global stylesheet (import once in the root layout)
import "@workspace/ui/globals.css"
```

## Component structure

Every component lives in `src/components/{name}/` with four files: implementation, `index.ts` re-export, a Storybook CSF story, and a Vitest + Testing Library test. Read `index.ts` before importing — never guess exports.

## Development

```sh
pnpm --filter @workspace/ui storybook        # start Storybook on :6006
pnpm --filter @workspace/ui test:watch       # Vitest watch mode
pnpm --filter @workspace/ui audit:stories    # check story coverage
pnpm --filter @workspace/ui audit:stories:fix  # generate missing baseline stories
```

## Design rules

- CSS custom property tokens only (`var(--primary)`, etc.) — no hardcoded colours.
- Dark mode via `.dark` class and token system.
- Every component registered in `src/lib/registry.ts`.
- See `docs/runbooks/COMPONENT-MIGRATION-RUNBOOK.md` for adding non-shadcn components.
