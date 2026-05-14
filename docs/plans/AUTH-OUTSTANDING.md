# Auth + Onboarding — Outstanding Work

Tracks every design-faithful gap intentionally deferred from the
"hoist-chrome-into-layouts + move-shells-to-blocks" refactor. None of
these are bugs — the surface is structurally correct (route-group
layouts compose `AuthShell` + `AuthAside` from `packages/ui/blocks/*`,
pages render only their form column). What's missing is design fidelity:
component sizing, dual-scrim aside, brand chrome, language switcher,
footer legal links. Most are blocked on the in-flight typography system
work; the rest are small composites we will ship after that lands.

Scope: `apps/web/app/auth/(default)/*`, `apps/web/app/onboarding/(owner)/*`,
`apps/web/app/onboarding/member/*` and the shared block surfaces in
`packages/ui/src/blocks/auth-shell` + `packages/ui/src/blocks/auth-aside`.

## Component-system extensions (cannot ship without)

| ID | Component | Today | Design wants | Fix path |
|----|-----------|-------|--------------|----------|
| **G1** | `Button` | sizes `xs`/`sm`/`default`/`lg`, max `h-9` (36 px) | 42 px tall CTAs | Add `xl` size variant in `buttonVariants` cva (e.g. `h-10 px-3`). Tokens only, no raw CSS. |
| **G2** | `Input` | fixed `h-8`, no `size` prop | ~38 px default, ~42 px on auth screens | Add `size` cva on `Input` (`default`/`lg`) plus matching adjustments in `PasswordInput` wrapper. |
| **G3** | `AuthAside` (variant `photo`) | one center radial scrim | two anchored ellipse scrims: top-left under headline + bottom-left under quote | Expose `<AuthAside.Scrim slot="top" \| "bottom">` slots OR add a `scrim="dual"` prop that renders both. |
| **G4** | `AuthAside` children layout | single `flex flex-col gap-6` | top-anchored headline + bottom-anchored quote+marquee, `justify-between` | Add `AuthAside.Top` / `AuthAside.Bottom` sub-slots that map to the two scrim regions. |
| **G5** | `AuthAsideLogoMarquee` | takes `LogoItem[]` (image src + alt) | text-placeholder names (`Parallel`, `Vantage`, `Cobalt`, `Northwind`, `Helix`, `Atrium`, `Lumen`) until real brand SVGs land | Accept `string[]` as input OR ship a sibling `AuthAsideTextMarquee` component. Centralize the placeholder list as `AUTH_ASIDE_LOGOS` config constant. |
| **G6** | `AuthAside` bg image position | `bg-center` | `bg-left-center` per design | Add `bgAlign` prop (`center` \| `left` \| `right`). |
| **G7** | `AuthShellHeader` | vertical `flex-col`, single column (back-link OR brand mark) | horizontal top row: brand mark left + `↗ Return to afframe.com` right | Add `layout="row"` mode (or a `<AuthShellHeader.Row>` slot pair). Brand goes left, optional CTA right. |
| **G8** | Language picker | nothing | dropdown with globe icon + locale list reading from `@workspace/i18n` config | New composite `LanguagePicker` in `packages/ui/src/components/language-picker/` using existing `DropdownMenu` + lucide `Globe`. No hardcoded locales — pulls from i18n config so adding a new language ships automatically. |

After G1–G8 ship, the `(default)/layout.tsx` and `(owner)/layout.tsx` /
`member/layout.tsx` route-group layouts get updated in one place to use
the new variants — every screen benefits.

## App-side outstanding

- **Real brand SVG mark.** `apps/web/app/auth/(default)/layout.tsx` +
  the two onboarding layouts currently render `{brand}` as plain text.
  Once typography lands, swap for an inline SVG mark (config constant in
  `packages/shared` per the locked plan), preserve the text fallback for
  accessibility.
- **"Return to afframe.com" CTA.** Top-right of every auth/onboarding
  header. Blocked on G7. Copy: i18n key `auth.layout.returnLink`
  (`"Return to afframe.com"`, target `https://afframe.com`).
- **Footer legal + status.** Privacy / Terms / Status links are
  currently absent. Targets unknown — keep `href="#"` until the legal
  team produces final URLs. Track here:
  - Privacy policy URL — `<TBD legal>`
  - Terms of service URL — `<TBD legal>`
  - Status page URL — `<TBD ops>`
- **Language picker in footer.** Blocked on G8.
- **Per-screen back link in header slot.** Today every step renders an
  inline `<Link>` at the top of the body column ("Back" / "Use a
  different email" / "Try another method"). With G7 these lift into the
  `AuthShellHeader` slot via React Context so chrome owns them.
- **Contact-sales paragraph on `/auth/login`.** Design has
  `Looking to get started with Afframe for your business? Contact sales ↗`
  below the form. Add once copy is locked. i18n keys: `auth.login.contact.copy`
  + `auth.login.contact.cta`. Currently absent.

## Aside content (design-faithful copy)

The design uses Acme/Northwind/Helix-style placeholder logos and a
specific quote. Today's i18n already carries the Afframe-flavored
quote (Lukáš Krejčí, Krejčí & Partneři) which is fine. The placeholder
logo marquee names should ship as a config constant once G5 lands:

```ts
// packages/shared/src/brand/auth-aside-logos.ts (to add)
export const AUTH_ASIDE_LOGOS = [
  "Northwind", "Helix", "Atrium", "Lumen",
  "Parallel", "Vantage", "Cobalt",
] as const
```

## Verification plan when typography merges

1. Land G1 + G2 (Button `xl`, Input `size`) in one PR per phase rules.
2. Update auth + onboarding screens to use the new sizes (only the
   `size` prop changes in pages — no chrome rewiring).
3. Land G3–G7 as a single `AuthAside` / `AuthShellHeader` upgrade PR.
4. Land G8 `LanguagePicker` + wire into both layouts' footers.
5. Side-by-side check vs `~/Desktop/workspace/Onboarding-monorepo/auth/`
   design source for each of the 14 screens.
6. Storybook stories for each new variant under `Blocks/AuthShell`,
   `Blocks/AuthAside`, `Components/LanguagePicker`.

## Follow-ups surfaced during refactor audit

These are NOT new design gaps — they're code-quality improvements
flagged by the architecture advisor after the chrome hoist. Bundle
them with the typography work or do them standalone, your call.

- **Derive wizard step in layout, not in page.** Today every step page
  hard-codes `<WizardProgress current={N} total={7} />`. Reordering or
  renaming a step requires editing 7 owner pages + 4 member pages.
  Better: `(owner)/layout.tsx` reads `useSelectedLayoutSegment()`
  against a `STEP_ORDER` constant in `_lib/`, renders `<WizardProgress>`
  once. Same for `member/layout.tsx`. Trade-off: layout becomes
  client-component-ish (the hook is client-only); use a client child
  component inside the server layout.
- **Extract `<BackLink href label />` server component.** The inline
  pattern `<Link><ChevronLeft className="size-4" />{label}</Link>` is
  duplicated across 7+ pages (`login/password`, `login/mfa`,
  `forgot-password`, `reset-password`, every wizard step). Land it in
  `apps/web/app/_components/back-link.tsx` now even though G7 will
  later lift it into the `AuthShellHeader` slot — the primitive is
  useful regardless.
- **Extract `<FormHeading title description />` server component.**
  The `<header className="flex flex-col gap-2"><h1 …>{title}</h1><p
  …>{description}</p></header>` block repeats on every form (~15
  screens). One primitive, one place to evolve typography.
- **Delete dead-weight passthrough layouts.** `app/auth/layout.tsx` +
  `app/onboarding/layout.tsx` just render
  `<div className="min-h-svh bg-background">{children}</div>`. AuthShell
  already sets `min-h-svh` in the `(default)` / `(owner)` / `member`
  layouts, and `bg-background` is provided by the root html element.
  Safe to remove unless we'll wire them for theme-scope or segment
  metadata.
- **`(quiet)` route-group escape hatch.** Forgot-password + reset-password
  currently share the photo aside with login + signup + invite. If
  product later decides these recovery flows should feel quieter (no
  marketing aside or a different one), carve a new
  `app/auth/(quiet)/layout.tsx` and `git mv` forgot/reset into it.
  Single-file change.

## What was completed in this refactor (for context)

- `AuthShell` + `AuthAside` moved from
  `packages/ui/src/components/` to `packages/ui/src/blocks/` (correct
  semantic — they compose multiple components, not atomic primitives).
  Storybook glob already recursive so stories still discovered;
  re-titled to `Blocks/*`.
- Chrome wiring hoisted into Next.js route-segment layouts:
  - `app/auth/(default)/layout.tsx` (login, signup, forgot, reset, invite)
  - `app/onboarding/(owner)/layout.tsx` (owner 7-step wizard)
  - `app/onboarding/member/layout.tsx` (member 4-step wizard)
- Old per-app shells (`onboarding-shell.tsx`, `member-shell.tsx`)
  retired to `_junk/onboarding-shells/`. Progress meter survives as
  `apps/web/app/onboarding/_components/wizard-progress.tsx`.
- ~12 page files stripped down to form-column content only.
