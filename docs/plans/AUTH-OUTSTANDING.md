# Auth + Onboarding — Outstanding Work

Tracks design-faithful gaps remaining after the auth layout implementation.
For the full design contract, see [`docs/specs/AUTH-LAYOUT.md`](../specs/AUTH-LAYOUT.md).

## Completed (this PR)

| ID | Component | Status |
|----|-----------|--------|
| G1 | Button `xl` size (h-11) | Done |
| G2 | Input `inputSize="xl"` (h-11) | Done |
| G3 | Dual aside scrim (two stacked radial gradients, one layer) | Done |
| G4 | `AuthAside.Top` / `AuthAside.Bottom` anchored slots | Done |
| G5 | Text-logo marquee via `AUTH_ASIDE_LOGOS` constant | Done |
| G6 | `bgAlign` prop on `AuthAside` | Done |
| G7 | Header horizontal row (brand left + return CTA right) | Done (composed inline) |
| G8 | `LanguagePicker` composite | Done |

## Remaining Component Gaps

| ID | What | Why blocked |
|----|------|-------------|
| G9 | `Heading` weight prop (`bold` / `semibold`) | Currently using className override `font-semibold` on `AuthAsideHeadline`. Proper fix: add weight variant to Heading cva so `level={1}` isn't locked to bold. |
| G10 | `Text` tone prop (`default` / `inherit`) | Aside uses `text-current` override because `variant="muted"` couples size with `text-muted-foreground` color. Proper fix: separate color from size in Text cva. |

## App-Side Outstanding

- **Real brand SVG mark.** `WalletMinimal` icon is a placeholder. Swap for
  inline SVG when brand assets are finalized. Config in `packages/shared`.
- **Footer legal URLs.** Privacy / Terms / Status use `href="#"`. Replace when
  legal team provides final URLs.
- **Wizard step derivation.** Every step page hard-codes
  `<WizardProgress current={N} total={7}>`. Better: derive in layout via
  `useSelectedLayoutSegment()` + `STEP_ORDER`. Reordering steps then requires
  editing the constant only.
- **`BackLink` server component.** Inline `<Link><ChevronLeft/>{label}</Link>`
  duplicated across 7+ pages. Extract to `apps/web/app/_components/back-link.tsx`.
- **`FormHeading` server component.** `<header><Heading>title</Heading><Text>desc</Text></header>`
  repeated ~15 times. Extract once.

## Design Source

Reference designs at `~/Desktop/workspace/Onboarding-monorepo/auth/`.
Side-by-side review against those files for pixel-level verification.
