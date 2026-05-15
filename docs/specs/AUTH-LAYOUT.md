# Auth & Onboarding Layout Specification

Design contract for all auth and onboarding screens. Any agent or developer
implementing a new screen in `apps/web/app/auth/` or `apps/web/app/onboarding/`
MUST follow these rules.

## Architecture

```
apps/web/app/auth/(default)/layout.tsx   ← default chrome (login, signup, forgot, reset)
apps/web/app/auth/invite/layout.tsx      ← override: inviter card aside
apps/web/app/onboarding/(owner)/layout.tsx ← owner wizard (7 steps)
apps/web/app/onboarding/member/layout.tsx  ← member wizard (4 steps)
```

Pages render ONLY their form content. All chrome (header, footer, aside) lives
in the layout. Never duplicate chrome in a page file.

Blocks live in `packages/ui/src/blocks/`:
- `auth-shell/` — grid container, header, body, footer, aside, left-column
- `auth-aside/` — photo aside with scrim, headline, subtitle, quote, marquee

## Grid

```
md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]
```

- 40/60 split (form column / aside)
- `minmax(0, Nfr)` is mandatory — bare `Nfr` lets aside content (marquee)
  inflate the track and starve the form column to 0px
- Left column scrolls independently: `md:h-svh md:overflow-y-auto`
- Aside: `md:h-svh` fixed, no scroll

## Safe Zones (Padding)

All values in px. `p-10` = 40px in Tailwind.

| Slot | Padding | Rule |
|------|---------|------|
| Header | `px-10 pt-10 pb-0` | Same horizontal as body |
| Body | `px-10 py-10` | Primary safe zone |
| Footer | `px-10 py-10` | Same as header horizontal |
| Aside | `p-10` | Matches body safe zone exactly |

Header, footer, and aside horizontal padding MUST equal body horizontal padding.
Never use different values. Form content is centered within body via `max-w-md`.

## Header Row

Left: brand mark + brand name
- Icon: `WalletMinimal` from `@workspace/ui/lib/icons` (placeholder until real SVG)
- Text: `text-base font-semibold tracking-tight`
- No background on icon, just the icon itself

Right: return-to-marketing link
- Icon: `ArrowUpRight` + "Return to afframe.com"
- Style: `text-sm text-muted-foreground hover:text-foreground`

## Footer Row

Left: `© {year} {brand}`

Right (flex, gap-4):
- Privacy / Terms / Status links (`href="#"` until legal provides URLs)
- `LanguagePicker` component

## LanguagePicker

Composes: `DropdownMenu` + `Button variant="outline" size="sm"` + `Globe` icon

- `DropdownMenuContent side="top"` — always opens upward from footer position
- Reads locale list from `@workspace/i18n/config` — zero hardcoded languages
- Shows `Check` icon next to active locale
- Single locale still renders (signals localizability)

## Aside Photo Scrim

The scrim is ONE full-aside layer (`absolute inset-0`) with TWO stacked radial
gradients in a single `background-image` CSS property.

```
Top gradient:    ellipse 55% 35% at 28% 18%
Bottom gradient: ellipse 55% 30% at 25% 82%
```

Color stops (each gradient): `rgba(0,0,0, 0.55 → 0.35 → 0.15 → 0.05 → 0)`

Rules:
- NO `backdrop-blur` — only radial gradient darkness
- NO `border-radius` on scrim
- NO per-slot scrim containers (creates visible boundary lines)
- ONE layer covers the full aside; each radial fades naturally into the photo
- The gradient must reach `transparent 100%` — no hard cutoff

## Aside Content Layout

Two anchored slots via `<AuthAside.Top>` + `<AuthAside.Bottom>`:

```
┌──────────────────────────────┐
│  Top: headline + subtitle    │  ← anchored to top
│                              │
│                              │
│                              │
│  Bottom: quote + marquee     │  ← anchored to bottom
└──────────────────────────────┘
```

Inner wrapper: `flex-1 justify-between` when slots are present.
Each slot: `max-w-xl` (576px, ~2/3 of aside width).

### Headline
- `<Heading level={1}>` with className override `font-semibold lg:text-4xl`
- Override is necessary: level=1 defaults to `font-bold`, design wants semibold
- Color: inherited (white on photo aside)

### Subtitle
- `<Text variant="muted">` with `text-current opacity-80`
- `text-current` overrides muted-foreground color for white-on-photo context

### Quote
- `<Text variant="lead">` rendered as `<blockquote>` via `asChild`
- Curly quotes via CSS `before:content-['“'] after:content-['”']`
- `text-current opacity-95`
- Author + role on ONE line: `"Name — Role"` (em dash separator)
- Author: `font-medium`, Role: `font-normal opacity-80`

### Logo Marquee
- Text placeholders from `AUTH_ASIDE_LOGOS` constant (`@workspace/shared`)
- `font-heading text-sm font-semibold tracking-tight opacity-70`
- Edge fade: `mask-image: linear-gradient(90deg, transparent, black 8%, black 92%, transparent)`
- Wrapped in `overflow-hidden` container — must never bleed into form column
- `[--duration:32s] [--gap:2.25rem]`

## Form Column Typography

| Element | Component | Props / className |
|---------|-----------|-------------------|
| Page heading | `<Heading level={2}>` | `className="mt-0"` |
| Description | `<Text variant="muted">` | — |
| Input | `<Input>` | `inputSize="xl"` (h-11) |
| Primary CTA | `<Button>` | `size="xl"` (h-11) |
| Secondary CTA | `<Button variant="outline">` | `size="xl"` |
| Divider | `<FieldSeparator>` | — |
| Error text | `<Text variant="small">` | `className="text-destructive"` |

## Rules for New Screens

1. **Form-only pages.** Never add header/footer/aside in a page file.
2. **Components only.** Use `packages/ui` components. Never hardcode HTML elements
   with raw Tailwind that duplicates what a component already provides.
3. **If the design needs a variant that doesn't exist:** list it as a gap, implement
   with the closest existing variant, and document in `AUTH-OUTSTANDING.md`.
4. **All copy from i18n.** Zero hardcoded strings. Keys under `auth.*` namespace.
5. **Icons from re-export only.** `@workspace/ui/lib/icons`, never direct lucide import.
6. **No raw CSS overrides on components.** If a component needs a new size/variant,
   extend the component's cva, never wrap it in arbitrary className hacks.

## Outstanding (Not Yet Implemented)

See `docs/plans/AUTH-OUTSTANDING.md` for remaining gaps:
- Real brand SVG (currently placeholder icon)
- Footer legal URLs (currently `href="#"`)
- `Heading` weight prop (to avoid className override for semibold + text-4xl)
- `Text` tone prop (to inherit color on dark backgrounds without override)
- Wizard step derivation from layout segment (currently hardcoded per page)
- `BackLink` + `FormHeading` extracted server components
