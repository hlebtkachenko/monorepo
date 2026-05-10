# Component Migration Runbook

Adding non-shadcn components from external registries to the monorepo.

## Source of Truth

- **Starter repo** (`hlebtkachenko/starter`): catalog of 59 non-shadcn primitives. Reference only for WHAT exists and WHERE it came from. Never copy code from starter directly.
- **Component manifest**: `starter/docs/new-components.md` lists all 59 primitives with upstream URLs, deps, and file lists.
- **Our registry**: `packages/ui/src/lib/registry.ts` tracks all components with metadata.

## Workflow Per Component

### Step 1: Classify

Before writing code, determine what the component actually is:

| Classification | Criteria | Where it lives | Examples |
|---|---|---|---|
| **Component** | Renders DOM, has visual identity, testable in isolation | `packages/ui/src/components/{name}/` (4-file pattern) | ActionBar, Swap, BorderBeamButton |
| **Button variant** | Visual variation of a button, composes our Button | `packages/ui/src/components/{name}/` (4-file pattern) | AnimatedShinyButton, LiquidMetalButton |
| **Utility** | No visual output, thin wrapper or helper function | `packages/ui/src/lib/{name}.tsx` | DownloadTrigger |
| **Hook** | Behavioral pattern reusable across components | `packages/ui/src/hooks/{name}.ts` | useStatefulButton |

Questions to ask:
- Does it render its own DOM? → Component
- Is it a wrapper that adds behavior to children? → Check if it's closer to Swap (component) or DownloadTrigger (utility)
- Could this behavior apply to multiple components? → Hook
- Does it compose our Button primitive? → Button variant (still a component)

**Always consult the user** if classification is ambiguous. Never assume.

### Step 2: Research Origin

1. Find the upstream URL from `starter/docs/new-components.md`
2. Fetch the upstream docs to understand the component's API
3. Read the starter's version to see what was customized
4. Note the starter's `@deviations` tag (in example files) — lists what changed from upstream

```bash
# Find upstream URL
awk '/^### .*Component Name/,/^### |^---/' \
  /path/to/starter/docs/new-components.md

# Check starter's deviations
grep -A1 '@deviations' /path/to/starter/src/components/examples/{name}-default.tsx
```

### Step 3: Install from Origin

**Never copy from starter.** Install from the upstream source:

- If the upstream supports shadcn CLI: check `pnpm dlx shadcn@latest add "@registry/name" --dry-run` from `apps/web/` first
- If manual: adapt the upstream source directly, rewriting imports to `@workspace/ui/...`

shadcn CLI limitation: it installs flat files, not our 4-file directory pattern. Always restructure after CLI install, or skip CLI and write directly.

### Step 4: Adapt to Our Standards

Every component MUST:

1. **Use CSS custom property tokens** (`var(--background)`, `var(--primary)`, etc.), never hardcoded colors
2. **Compose with existing primitives** (use our Button, not raw `<button>`)
3. **Support dark mode** via `.dark` class and token system
4. **Support future themes** via token overrides
5. **Use `@workspace/ui/...` imports** for all internal references

If the upstream has hardcoded colors, inline styles with fixed values, or doesn't use our primitives — rewrite it. The upstream is a reference for WHAT the component does, not HOW it should be implemented.

Exceptions: shader/WebGL animations can use hardcoded values for the effect itself, but text, sizing, disabled states, and focus states must use tokens.

### Step 5: Create Files

For components (4-file pattern):

```
packages/ui/src/components/{name}/
├── {name}.tsx          # component implementation
├── index.ts            # export * from "./{name}"
├── {name}.stories.tsx  # Storybook CSF stories
└── {name}.test.tsx     # Vitest + React Testing Library
```

For utilities: `packages/ui/src/lib/{name}.tsx`
For hooks: `packages/ui/src/hooks/{name}.ts`

### Step 6: Stories

Cover all visual variants:

- One story per CVA variant value (skip `default`)
- One story per size value (skip `default`)
- Disabled state (if applicable)
- All prop unions that map to visual changes

For compound components (where variants live on sub-components), write render functions manually — the auto-generator cannot handle these.

Audit coverage: `pnpm --filter @workspace/ui audit:stories`

### Step 7: Register

Add entry to `packages/ui/src/lib/registry.ts` in alphabetical order:

```typescript
"component-name": {
  source: "diceui",           // origin library
  sourceType: "import",       // "vanilla" | "import" | "custom"
  upstream: "https://...",    // origin docs URL
  description: "One-liner",
  categories: ["actions"],    // grouping tags
  dependencies: ["button"],   // other components it needs (optional)
  packages: ["some-pkg"],     // extra pnpm packages (optional)
},
```

### Step 8: Showcase

Add section to `apps/web/app/showcase/page.tsx` in alphabetical order.

- Follow the section comment pattern: `{/* ==================== NAME ==================== */}`
- If component needs client state, create demo at `apps/web/app/showcase/_components/{name}-demo.tsx`
- See `docs/runbooks/SHOWCASE-RUNBOOK.md` for full details

### Step 9: Verify

```bash
pnpm typecheck     # must pass
pnpm test           # must pass
pnpm build          # must pass
pnpm --filter @workspace/ui audit:stories  # check coverage
```

Start dev server and visually verify in showcase + Storybook.

## Shared Utilities

These hooks and utilities are already available for new components:

| Utility | Path | Used by |
|---|---|---|
| `useComposedRefs` | `@workspace/ui/lib/compose-refs` | ActionBar |
| `useAsRef` | `@workspace/ui/hooks/use-as-ref` | ActionBar, Swap |
| `useIsomorphicLayoutEffect` | `@workspace/ui/hooks/use-isomorphic-layout-effect` | ActionBar, Swap |
| `useLazyRef` | `@workspace/ui/hooks/use-lazy-ref` | Swap |
| `useStatefulButton` | `@workspace/ui/hooks/use-stateful-button` | Standalone hook |
| `cn` | `@workspace/ui/lib/utils` | All components |
| `DownloadTrigger` | `@workspace/ui/lib/download-trigger` | Standalone utility |

## Installed Packages

These are already in `packages/ui/package.json` and available:

- `@ark-ui/react` — Ark UI primitives (DownloadTrigger, future components)
- `@paper-design/shaders` — WebGL shader effects (LiquidMetalButton)
- `border-beam` — Animated border beam (BorderBeamButton)
- `motion` — Framer Motion animations (future components)
- `radix-ui` — Radix UI primitives (ActionBar, Swap, most shadcn components)

## Anti-Patterns

- **Never copy from starter directly** — trace to origin, install clean
- **Never use `@/components/ui/` imports** — always `@workspace/ui/components/`
- **Never hardcode colors** — use CSS tokens
- **Never create raw `<button>` elements** — compose our Button
- **Never skip registry entry** — every component/utility/hook must be registered
- **Never add stories without checking coverage** — run `audit:stories`
- **Never implement without classifying first** — consult user if unsure
