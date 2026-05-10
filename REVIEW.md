---
phase: code-review
reviewed: 2026-05-10T14:30:00Z
depth: deep
files_reviewed: 29
files_reviewed_list:
  - AGENTS.md
  - apps/web/app/showcase/_components/action-bar-demo.tsx
  - apps/web/next-env.d.ts
  - packages/ui/.storybook/preview.ts
  - packages/ui/package.json
  - packages/ui/scripts/audit-stories.ts
  - packages/ui/src/components/accordion/accordion.stories.tsx
  - packages/ui/src/components/action-bar/action-bar.stories.tsx
  - packages/ui/src/components/action-bar/action-bar.test.tsx
  - packages/ui/src/components/action-bar/action-bar.tsx
  - packages/ui/src/components/action-bar/index.ts
  - packages/ui/src/components/badge/badge.stories.tsx
  - packages/ui/src/components/button/button.stories.tsx
  - packages/ui/src/components/carousel/carousel.stories.tsx
  - packages/ui/src/components/combobox/combobox.stories.tsx
  - packages/ui/src/components/input-otp/input-otp.stories.tsx
  - packages/ui/src/components/native-select/native-select.stories.tsx
  - packages/ui/src/components/radio-group/radio-group.stories.tsx
  - packages/ui/src/components/select/select.stories.tsx
  - packages/ui/src/components/swap/index.ts
  - packages/ui/src/components/swap/swap.stories.tsx
  - packages/ui/src/components/swap/swap.test.tsx
  - packages/ui/src/components/swap/swap.tsx
  - packages/ui/src/hooks/use-as-ref.ts
  - packages/ui/src/hooks/use-isomorphic-layout-effect.ts
  - packages/ui/src/hooks/use-lazy-ref.ts
  - packages/ui/src/lib/compose-refs.ts
  - packages/ui/src/lib/download-trigger.tsx
  - packages/ui/src/lib/registry.ts
findings:
  critical: 2
  warning: 6
  info: 3
  total: 11
status: issues_found
---

# Code Review Report

**Reviewed:** 2026-05-10
**Depth:** deep
**Files Reviewed:** 29
**Status:** issues_found

## Summary

This PR adds two new components (ActionBar, Swap), a download-trigger utility, a component registry, a story audit script, shared hooks/utilities, and 30+ auto-generated stories. The new components (ActionBar, Swap) are well-structured with proper keyboard navigation, context patterns, and token-based styling. The compose-refs utility and shared hooks are clean ports from established libraries.

However, the PR has two critical issues: (1) the story audit script's `--fix` mode generates broken stories for compound components, and 17 of those broken stories were committed in this PR; (2) the ActionBar separator has inverted `aria-orientation` semantics, which is an accessibility bug. There are also several warnings around missing accessible labels, inconsistencies, and a suspicious upstream URL.

## Critical Issues

### CR-01: Audit script generates broken stories for compound components

**File:** `packages/ui/scripts/audit-stories.ts:292-304`
**Issue:** The `generateMissingStories` function generates stories using a simple `args: { children: "...", variant: "..." }` pattern. This is fundamentally incompatible with compound components (Accordion, Carousel, Combobox, InputOTP, RadioGroup, Select, ButtonGroup, ToggleGroup, Field, NativeSelect, Swap, ActionBar) that require specific sub-component children. The generated stories render broken/empty UI. 17 such broken stories were committed in this PR across these files:

- `accordion.stories.tsx` (Disabled)
- `carousel.stories.tsx` (OrientationHorizontal)
- `combobox.stories.tsx` (Disabled)
- `input-otp.stories.tsx` (Disabled)
- `radio-group.stories.tsx` (Disabled)
- `select.stories.tsx` (Disabled)
- `button-group.stories.tsx` (OrientationHorizontal)
- `toggle-group.stories.tsx` (OrientationHorizontal, OrientationVertical)
- `field.stories.tsx` (OrientationVertical, OrientationResponsive)
- `native-select.stories.tsx` (Disabled)
- `swap.stories.tsx` (ActivationModeClick, ActivationModeHover)
- `action-bar.stories.tsx` (AlignStart, AlignCenter, AlignEnd, SideTop, SideBottom)

**Fix:** The audit script needs a mechanism to identify compound components and skip auto-generation for them. One approach: maintain a list of compound component names, or detect whether the component's meta uses a `render` function in existing stories. For already-committed broken stories, either write proper render functions or remove them.

```typescript
// In audit-stories.ts, add a compound component check:
const COMPOUND_COMPONENTS = new Set([
  "accordion", "action-bar", "carousel", "combobox", "field",
  "input-otp", "native-select", "radio-group", "select",
  "button-group", "toggle-group", "swap",
])

function generateMissingStories(audit: ComponentAudit, componentDir: string): void {
  if (COMPOUND_COMPONENTS.has(audit.name)) {
    console.log(`    -> Skipping ${audit.name} (compound component, needs manual stories)`)
    return
  }
  // ... existing logic
}
```

### CR-02: ActionBarSeparator has inverted aria-orientation

**File:** `packages/ui/src/components/action-bar/action-bar.tsx:639-646`
**Issue:** The separator inherits `orientation` from the toolbar context, but separator orientation should be perpendicular to the container's orientation. In a horizontal toolbar, separators are visually vertical lines (the CSS is correct: `h-6 w-px`), but `aria-orientation` is set to `"horizontal"`. According to WAI-ARIA, the separator's `aria-orientation` should describe the separator itself, not its container.

**Fix:**
```typescript
const context = useActionBarContext(SEPARATOR_NAME)
// Separator orientation is perpendicular to container orientation
const resolvedOrientation = orientationProp ?? (context.orientation === "horizontal" ? "vertical" : "horizontal")

// ...
<SeparatorPrimitive
  role="separator"
  aria-orientation={resolvedOrientation}
```

## Warnings

### WR-01: ActionBarClose lacks default aria-label

**File:** `packages/ui/src/components/action-bar/action-bar.tsx:613-622`
**Issue:** The close button renders without an accessible name. In practice it contains only an SVG icon (as shown in both the stories and the showcase demo). Screen readers will announce it as an unlabeled button.

**Fix:** Add a default `aria-label`:
```tsx
<ClosePrimitive
  type="button"
  aria-label="Close"
  data-slot="action-bar-close"
  {...closeProps}
```

### WR-02: ActionBar uses React.useLayoutEffect instead of useIsomorphicLayoutEffect

**File:** `packages/ui/src/components/action-bar/action-bar.tsx:154`
**Issue:** The component imports `useIsomorphicLayoutEffect` (line 12) and uses it for item registration (line 447), but the mount detection at line 154 uses bare `React.useLayoutEffect`. This is inconsistent. While `"use client"` components in Next.js won't trigger the SSR warning in practice, using the project's own SSR-safe wrapper is the correct convention.

**Fix:**
```typescript
useIsomorphicLayoutEffect(() => {
  setMounted(true)
}, [])
```

### WR-03: download-trigger upstream URL points to non-official domain

**File:** `packages/ui/src/lib/registry.ts:41`
**Issue:** The upstream URL for download-trigger is `https://shark.vini.one/docs/utilities/download-trigger`. This is not the official Ark UI documentation domain (which is `ark-ui.com`). The domain `shark.vini.one` appears to be a third-party or personal site. This could be a copy-paste error or a link that will rot.

**Fix:**
```typescript
upstream: "https://ark-ui.com/react/docs/utilities/download-trigger",
```

### WR-04: Registry entry `download-trigger` breaks alphabetical order

**File:** `packages/ui/src/lib/registry.ts:38`
**Issue:** The `download-trigger` entry is inserted at position 4 (between `alert` and `alert-dialog`) instead of its alphabetical position (between `direction` and `drawer`). The rest of the registry is alphabetically sorted. This makes it harder to find entries and verify completeness.

**Fix:** Move the `download-trigger` entry to between `direction` and `drawer` in the registry object.

### WR-05: Audit script storyNameExists has overly loose suffix matching

**File:** `packages/ui/scripts/audit-stories.ts:212`
**Issue:** The `storyNameExists` function matches if either the existing story name ends with the target or vice versa: `ns.endsWith(nt) || nt.endsWith(ns)`. This can produce false negatives (the audit incorrectly reports a story exists when it does not cover the variant). Example: if the target is `"Link"` and an existing story is `"SidebarLink"`, the suffix check passes, masking the missing "Link" variant story.

**Fix:** Tighten the suffix matching to require the prefix portion to be a known namespace prefix (like the component or variant name), or require exact match with optional known prefixes:
```typescript
function storyNameExists(existing: string[], target: string): boolean {
  const nt = target.toLowerCase().replace(/[-_]/g, "")
  return existing.some((s) => {
    const ns = s.toLowerCase().replace(/[-_]/g, "")
    if (ns === nt) return true
    if (nt.startsWith("size") && SIZE_ALIASES[nt]?.includes(ns)) return true
    // Only match suffix if the prefix is a known variant group name
    if (ns.endsWith(nt) && ns.length > nt.length) return true
    return false
  })
}
```

### WR-06: Swap exports internal useStore as useSwap

**File:** `packages/ui/src/components/swap/swap.tsx:258`
**Issue:** The internal `useStore` hook is exported as `useSwap`. This exposes the component's internal state management (a custom external store with `subscribe`, `getState`, `setState`) to consumers. The hook only provides access to `swapped: boolean`, which consumers already control via the `swapped` prop and `onSwappedChange` callback. This is unnecessary API surface that couples consumers to internal implementation details.

**Fix:** Remove the `useStore as useSwap` export unless there is a documented use case for child components that need to read swap state independently of the context.

```typescript
export { Swap, SwapOff, SwapOn, type SwapProps }
```

## Info

### IN-01: Registry includes download-trigger as a component but it lives in lib/

**File:** `packages/ui/src/lib/registry.ts:38-46`
**Issue:** The `download-trigger` is registered alongside components but resides in `packages/ui/src/lib/download-trigger.tsx`, not in the `components/` directory. This is semantically correct (it is a utility, not a full component), but the registry mixes utilities with components without a clear distinction beyond the `categories: ["utility"]` tag.

**Fix:** Consider adding a `type` field to `ComponentMeta` (e.g., `"component" | "utility" | "hook"`) or documenting the convention.

### IN-02: Audit script extractPropUnionVariants truncates at nested objects

**File:** `packages/ui/scripts/audit-stories.ts:136`
**Issue:** The regex `/(?:interface|type)\s+\w+(?:Props|Config)\b[^{]*\{([\s\S]*?)\n\}/g` uses non-greedy matching that stops at the first `\n}`. Interfaces containing nested object types will have their content truncated, causing prop union variants after the nested object to be missed (false negatives).

**Fix:** Use brace-depth counting (as done for CVA parsing) instead of regex for interface body extraction.

### IN-03: Generated stories use "use client" directive in action-bar.stories.tsx

**File:** `packages/ui/src/components/action-bar/action-bar.stories.tsx:1`
**Issue:** The story file starts with `"use client"`. Storybook story files don't need the React Server Component directive since Storybook renders everything on the client. This won't cause errors but is unnecessary and inconsistent with other story files in the codebase.

**Fix:** Remove the `"use client"` directive from story files.

---

_Reviewed: 2026-05-10_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
