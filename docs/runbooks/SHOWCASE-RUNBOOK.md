# Showcase Runbook — Agent Instructions

Add component demos to `apps/admin/app/(gated)/showcase/page.tsx`. This is a single-page showcase of ALL shadcn/ui components in the monorepo.

## Reference Example

Button section is already implemented. Use it as the template for all other components. Study its structure before starting.

## Rules

### Structure Rules

1. Each component gets an `<section className="mb-16">` wrapper
2. Each section starts with `<h2 className="mb-6 border-b pb-2 text-2xl font-semibold">{ComponentName}</h2>`
3. Sub-groups (Variants, Sizes, States, etc.) use `<h3 className="mb-3 text-sm font-medium text-muted-foreground">`
4. Items within a group use `<div className="flex flex-wrap gap-3">` or `<div className="flex flex-col gap-3">` depending on layout
5. Keep `className` patterns consistent with the Button reference section
6. Sections are separated by the comment `{/* ==================== COMPONENT_NAME ==================== */}`

### Import Rules

1. ALL components import from `@workspace/ui/components/{component-name}`
2. Icons import from `lucide-react`
3. Before importing, READ the component source file at `packages/ui/src/components/{component-name}/{component-name}.tsx`
4. Only import exports that ACTUALLY EXIST in the source file — grep for `export {` or `export function`
5. NEVER guess exports. NEVER use exports you haven't verified in the source file
6. If a component re-exports from a library (e.g., `from "radix-ui"`), use the wrapper names from the shadcn file, NOT the radix originals

### Content Rules

1. Show ALL variants if the component uses CVA (look for `cva(` in source)
2. Show ALL sizes if size variants exist
3. Show disabled state if the component accepts `disabled` prop
4. Use realistic but short placeholder text (e.g., "Project Settings" not "Lorem ipsum")
5. For interactive components (Dialog, Sheet, Drawer, etc.), wrap content in a trigger button
6. DO NOT add `"use client"` unless the component requires client-side state (useState, useEffect)
7. If client state is needed, extract that component demo into a separate client component file at `apps/admin/app/showcase/_components/{name}-demo.tsx` and import it into the main page

### Verification Checkpoints

After adding EACH component section:

1. Run `pnpm build` from the repo root — must pass with zero errors
2. If build fails, read the error, fix immediately before moving to next component
3. Never skip a failed build — fix it before proceeding

### Client Component Pattern

Some components need interactivity. When `useState` is required:

```tsx
// apps/admin/app/showcase/_components/slider-demo.tsx
"use client"
import { useState } from "react"
import { Slider } from "@workspace/ui/components/slider"

export function SliderDemo() {
  const [value, setValue] = useState([50])
  return <Slider value={value} onValueChange={setValue} className="w-64" />
}
```

Then in the main page:

```tsx
import { SliderDemo } from "./_components/slider-demo"
```

## Component Checklist

Work through in this exact order. Check off mentally as you complete each.

### Batch 1: Simple Display (no state needed)

These are server-renderable, no interactivity required.

- [ ] Badge — has variants (default, secondary, outline, destructive). Show all.
- [ ] Separator — horizontal and vertical. Wrap vertical in a flex row with height.
- [ ] Skeleton — show rectangle, circle, and text-line skeletons.
- [ ] Spinner — show default and with size variations if available.
- [ ] Kbd — show single keys and key combinations (Ctrl+C, etc.).
- [ ] Label — show standalone label.
- [ ] Progress — show at 0%, 33%, 66%, 100%. Static values, no state needed.
- [ ] Avatar — show with image fallback, text fallback, and AvatarGroup if exported.
- [ ] Alert — has variants. Show default and destructive with title + description.
- [ ] Card — show Card with Header, Title, Description, Content, Footer.
- [ ] Empty — show empty state with title, description.
- [ ] AspectRatio — show 16:9 and 1:1 with colored placeholder divs.
- [ ] Breadcrumb — show a 3-level breadcrumb with separator.
- [ ] Pagination — show basic pagination with prev/next and page numbers.
- [ ] Table — show a small table with 3-4 rows of sample data.

### Batch 2: Form Inputs (some need client state)

- [ ] Input — show default, with placeholder, disabled.
- [ ] Textarea — show default, with placeholder, disabled.
- [ ] Checkbox — show checked, unchecked, disabled. Needs client state.
- [ ] Switch — show on, off, disabled. Needs client state.
- [ ] RadioGroup — show a group with 3 options. Needs client state.
- [ ] Select — show with a few options. Needs client state.
- [ ] NativeSelect — show with options. No client state needed for basic demo.
- [ ] Slider — show with value. Needs client state.
- [ ] InputOTP — show 6-digit input. Needs client state.
- [ ] InputGroup — show input with addon/button.
- [ ] Field — show field with label, input, description, error.
- [ ] ButtonGroup — show group of related buttons.

### Batch 3: Overlays & Popups (need client triggers)

- [ ] Dialog — show with trigger button, title, description, actions.
- [ ] AlertDialog — show with trigger, confirmation title, cancel/continue.
- [ ] Sheet — show from right side with trigger button.
- [ ] Drawer — show with trigger button, content.
- [ ] Popover — show with trigger button and simple content.
- [ ] HoverCard — show with trigger text and card content.
- [ ] Tooltip — show on a button with text tooltip.
- [ ] DropdownMenu — show with trigger, items, separator, shortcut text.
- [ ] ContextMenu — show with right-click area and menu items.

### Batch 4: Navigation & Layout

- [ ] Tabs — show 3 tabs with content panels.
- [ ] Accordion — show 3 collapsible items.
- [ ] Collapsible — show single collapsible section.
- [ ] NavigationMenu — show with 2-3 top-level items.
- [ ] Menubar — show File/Edit/View style menubar.
- [ ] ScrollArea — show a tall content area with scrollbar.
- [ ] Resizable — show 2-panel resizable layout.
- [ ] Item — show item with media, content, actions.

### Batch 5: Advanced & Composite

- [ ] Combobox — show searchable select. Needs client state.
- [ ] Command — show command palette with groups and items.
- [ ] Calendar — show date picker calendar. Needs client state.
- [ ] Carousel — show 3-4 slides with prev/next.
- [ ] Toggle — show single toggle, pressed/unpressed. Show variant if exists.
- [ ] ToggleGroup — show group of toggles (e.g., bold/italic/underline).
- [ ] Sonner — show toast trigger button. Needs client wrapper.

### Batch 6: Skip (layout-level or utility)

These are NOT standalone demo-able or are layout-level wrappers:

- [ ] Sidebar — skip (requires full layout restructure)
- [ ] Direction — skip (RTL provider, not visual)
- [ ] Chart — skip (requires recharts data setup, too complex for showcase)

## Final Verification

After ALL components are added:

1. `pnpm build` — zero errors
2. `pnpm --filter admin dev` — open http://localhost:3100/showcase in browser
3. Verify page renders without blank sections or errors
4. Every `<h2>` section must have visible content beneath it
5. No TypeScript errors, no missing imports

## Anti-Hallucination Checklist

Before submitting work, verify:

- [ ] Every import path starts with `@workspace/ui/components/`
- [ ] Every imported symbol was verified by reading the source `.tsx` file
- [ ] No imports from `@/components/ui/` (wrong path for monorepo)
- [ ] No imports of non-existent components or exports
- [ ] Every `"use client"` component is in a separate file under `_components/`
- [ ] Build passes: `pnpm build` returns zero errors
