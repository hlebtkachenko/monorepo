# Building a governed `/o` archetype page — a field guide

> **Start here first:** [`PAGE-BUILD-START-HERE.md`](PAGE-BUILD-START-HERE.md) is
> the umbrella helper (respect-the-instruction spine, where the rules live,
> parallel-agent hygiene, gates). This file is its frontend/archetype deep-dive.

**Status:** guide, not law. It points you AT the rules and shows how we actually
built the Debug Archetype-Table reference pages (Normal + Pivot) so you can build
a sibling page for another module without repeating our dead-ends. Where this
guide and a source-of-truth doc disagree, the **source-of-truth wins** — this
file tells you WHERE that source is.

> Written from the #877 build (Debug → Archetype Table, `/o/[orgSlug]/debug/...`).
> It is deliberately honest about what we got wrong and how it was caught, because
> the wrong turns are the expensive part to rediscover.

---

## 0. The one rule that outranks the rest: respect the exact instruction

Most of our lost time came from **changing the user's instruction into something
adjacent** instead of implementing it literally, or from **inventing** a feature
that never existed. Both read to the user as "you lied / you fooled me." Avoid it:

- **Implement the literal spec, per token.** "Button group" ≠ "dropdown" ≠ "split
  button" ≠ "grouped split button". We shipped all four across rounds because we
  kept approximating. If the user names a component (e.g. shadcn `ButtonGroup`
  with a `DropdownMenu`), open THAT component and match it. See
  `feedback-literal-spec-over-goal`.
- **When the spec is ambiguous or you are about to make a load-bearing choice,
  STOP and do one of:** (a) ask the user a single crisp question, (b) escalate to
  the Advisor, (c) re-verify against the real files. Do NOT guess and ship. A
  wrong 8-file build costs far more than one question. See
  `feedback_surface_consequential_assumptions`, `feedback_disambiguate_yes`.
- **Never silently substitute.** If you believe the instruction is wrong or
  impossible, say so and propose the alternative — do not quietly implement your
  version. The user's observation outranks your theory (`feedback_verify_before_claim`).
- **"Revert" means byte-for-byte revert.** When asked to revert, `git checkout
<ref> -- <path>` and prove it (`git diff <ref> -- <path>` is empty). Do not
  "re-code it to look reverted". And verify the _ref you revert to_ is actually
  the "old" the user remembers — a regression may predate `main` (see §6, the
  search-width case: the real regression was in an already-merged commit, so
  reverting to `main` could not fix it).
- **If you catch yourself having misspelled the instruction, name the failure
  chain honestly** (`feedback_honest_root_cause`) — don't deflect.

Memory files encoding this: `feedback-literal-spec-over-goal`,
`feedback_verify_before_claim`, `feedback-recheck-dont-assume`,
`feedback_investigate_before_designing`, `feedback_honest_root_cause`.

---

## 1. Ship with no hallucinations — verify before you claim

- **Read the source before importing.** Never guess an export; the export list is
  at the bottom of each component file (CLAUDE.md → "Before Importing a Component").
- **Verify against git / live data, not memory.** Our search bar "regression" was
  root-caused by `git log -S` on the exact class string, which proved a specific
  merged commit (`#761`) changed `w-80` → `flex-1`. Memory would have lied. See
  `feedback_audit_verify_against_intent`, `feedback-recheck-dont-assume`.
- **Do not invent a "prior reference" or a feature.** We added a "Settings"
  inspector tab that was never in the baseline — we introduced it in one round and
  removed it in round 5; the rail's real tabs end in "More". We also briefly
  trusted a non-existent old tree. Confirm a thing exists in the BASELINE (`grep`,
  `git show`, CodeGraph) before "restoring" it. Memory `orgslug-rebuild` warns
  which trees are real.
- **CodeGraph first for structural questions** (where a symbol lives, callers,
  blast radius) before grep/read loops — `pnpm codegraph:ready`, then the MCP
  `codegraph_explore`. See `docs/runbooks/CODEGRAPH.md`.
- **Prove UI claims in the browser.** Measure, don't eyeball: we confirmed the
  toolbar overlap with `getBoundingClientRect()` (search.right vs Columns.left)
  and read the actual exported CSV off the clipboard rather than trusting the
  rendered grid. Do not say "fixed" without the measurement/screenshot.
  (Caveat: the dev server is the user's — never auto-start one; §5.)

---

## 2. Where the rules live (navigate, don't reinvent)

| You need to know…                                                                                                            | Source of truth                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| The app-shell, nav, content panels, "add a page/module/tabs" recipes                                                         | `docs/runbooks/APP-SHELL-PANELS.md`                                                                                                  |
| The five content archetypes (Table / Blank / Launchpad / Dashboard / Single) — data contracts, layouts, "pick one and build" | `docs/specs/CONTENT-ARCHETYPES.md`                                                                                                   |
| Which section kinds a given archetype body may host (tsc-enforced)                                                           | `packages/ui/src/blocks/archetypes/archetype-section-policy.ts` (`ARCHETYPE_SECTION_POLICY`) + memory `archetype-section-governance` |
| Shell tokens vs shadcn tokens (when to use which)                                                                            | CLAUDE.md → "Component Design Rules" + memory `appshell-tokens-convention`                                                           |
| Where a component lives (packages/ui vs apps/web)                                                                            | CLAUDE.md → "Web App Component Placement" + `apps/web/app/_components/README.md` + memory `ui-belongs-in-packages-ui-blocks`         |
| `/o` shell anatomy (`_shell/`, `_nav/`, `_components` grouping)                                                              | memory `feedback-orgslug-shell-grouping`, `orgslug-rebuild`                                                                          |
| PR workflow, size-cap, stacked PRs, changelog fragments                                                                      | `docs/conventions/PR-WORKFLOW.md`, CLAUDE.md → "Pull Request Workflow" + "Changelog Requirement", memory `afframe-pr-workflow`       |
| CI required vs advisory checks                                                                                               | `docs/conventions/CI-POLICY.md` (single source), CLAUDE.md → "CI / CD"                                                               |
| Accounting / Money / RLS / tenancy domain rules                                                                              | CLAUDE.md → "Domain Rules" + "Multi-tenant Isolation" + `ARCHITECTURE.md`                                                            |
| Session resume, working defaults, escalation cadence                                                                         | `/open-session` skill + `~/.claude/session-defaults.md`                                                                              |

**A-vs-B distinctions that bite:**

- **App-chrome blocks vs in-flow surfaces.** Anything that draws the outer shell
  (`blocks/app-shell`, `blocks/archetypes` chrome) uses the **shell token family**
  (`--canvas`, `--shell-surface`, `--border-subtle`, `--shell-*`). Dialogs,
  dropdowns, cards INSIDE the body keep standard shadcn tokens (`bg-card`, …).
  Mixing them is a review finding. (`appshell-tokens-convention`.)
- **Reusable composition vs single route.** A block reused by ≥2 routes → in
  `packages/ui` (design system, `blocks/*`). A single-route composition → that
  page's own `_components/`. Never put reusable UI in `apps/web`. Promote when a
  second consumer appears. (CLAUDE.md placement rules.)
- **Table vs Pivot** are both the Table archetype but differ: a flat Table has a
  `sectionTable` (the archetype auto-generates the per-column filter); a Pivot has
  `sectionPivotTable` (no flat table → the page owns the source filter). Export
  differs too (Pivot needs a bespoke `toCsv`, §4).

---

## 3. Build a Table-archetype page: the moving parts

The archetype is `packages/ui/src/blocks/archetypes/archetype-table.tsx`. It owns
the WHOLE content panel. **Governance is by construction** — required props mean a
bare/broken page won't compile:

- `views` (mandatory — at least "All"), `favorite` (mandatory star),
  `selectionActions` (mandatory PROP). Omitting any is a `tsc` error, by design.
  (Note: a page can satisfy the prop by returning `[]` and then no footer renders
  — the _prop_ is guaranteed, not a visible footer.)
- The **per-column filter is auto-generated** from the flat Table section's own
  columns (`useTableFilters` inside the archetype). The page never wires it, so it
  can't be forgotten — and on a flat Table the archetype **replaces** any toolbar
  `filter` you pass to `buildTableToolbar` with its auto filter, so don't pass one
  (it's silently ignored). A Pivot has no flat table, so it OWNS its source filter
  and its page-supplied `filter` IS used.
- `sections` is narrowed to the archetype's **allowed** section kinds
  (`AllowedSectionKind<"table">`). A wrong-kind section is a compile error.

Assemble the chrome through the shared builders (the "configure at app level, load
per page" pattern the user asked for):

- **Toolbar:** `buildTableToolbar(table, { search, status?, filter?, add? })` —
  the toolbar SHAPE lives in the design system; the page passes data. Call it
  inside `toolbar={(table) => …}`.
- **Footer:** `buildTableFooter(table, { export?, exportFileName?, toCsv?,
selectedIds?, onCopyLink?, onCopyId?, onOpenInspector?, actions? })` — the
  Export split button is generic; the page passes data + a Delete. Call it inside
  `selectionActions={(table, helpers) => …}`. `helpers.openInspectorTab(id, tab)`
  is how a footer item opens a row's Inspector on a specific tab (only the
  archetype can open the inspector; the page is outside the provider).
- **Inspector tabs:** `inspectorRowContent={(row) => Partial<Record<InspectorTab,
ReactNode>>}`. The rail ALWAYS lists every tab; a tab you don't return renders
  empty. Cross-cutting tabs (Details, Activity, Attachments, More) work on any
  record. There is **no "Settings" tab** — it's "More".
- **Inspector sections** compose the SAME branded `SectionList` +
  `sectionInspector*` factories as the body; they render through the closed
  `SECTION_REGISTRY`. Descriptors are Symbol-branded and must be minted inside the
  client boundary (memory `archetype-sections-rsc-boundary`).

**Interactive demo data (reference pages only):** keep it **session-scoped client
state** (a `useReducer`), never a write to the seeded demo table, so the page stays
a clean re-seedable template. Demo tables are dev-only, FORCE-RLS, empty in prod.

---

## 4. The Pivot export gotcha (a worked example of "practical, not visual")

The generic `selectionCsv` flattens `getVisibleLeafColumns() × selected rows`.
For a Pivot that is WRONG in two ways the user called out:

1. `getFilteredSelectedRowModel().rows` returns **top-level rows only**; a Pivot's
   Status sub-rows live in `row.subRows` — so walk descendants. (Note: the shared
   `selectionCsv` default already walks `subRows` at `build-table-footer.ts`, so
   descendant-walking alone does NOT require a bespoke `toCsv` — point 2 below is
   the real reason a Pivot needs its own serializer.)
2. A flat header loses the column-dimension band (month). The user wanted a
   **practical** CSV: a band header LINE above the measure line, and the row
   hierarchy un-pivoted into **real dimension columns** (Category repeated per
   line, Status or "Total"), read from `row.original.rowValues`. Not one indented
   column, not a fused `"2026-01 · Total"` header.

The design answer: `buildTableFooter` takes a `toCsv` override; the Pivot page
supplies a pivot-aware serializer (`debug-pivot-table-view.tsx` → `pivotCsv`). The
flat Table keeps the default. Lesson: **when a shared default can't express the
domain shape, add a seam (a callback), don't fork the shared thing.**

---

## 5. Verification gates — what "done" means before you push

Run locally, in order; do not claim done until each is green:

1. `pnpm typecheck` (or `--filter <pkg>`), 2. `pnpm test`, 3. `pnpm lint`
   (0 errors; pre-existing warnings are fine), 4. `pnpm build` for UI changes.
2. **Browser-verify UI**: measure, don't eyeball. NEVER auto-start a dev server —
   it is the user's; they open it (memory `feedback_dev_port_3030`). Verify against
   the RIGHT port (`$CONDUCTOR_PORT`); another Conductor workspace on a neighboring
   port is a DIFFERENT branch's code (we hit a 404 doing exactly this).
3. **`/thermo-review` + `/security-review`** on every non-trivial round before
   push; apply ALL findings (the user wants even cosmetic ones fixed). Real
   regressions our reviews caught: a shared CSS-var (`--app-statusbar-clearance`)
   clobbering a co-mounted status bar; a lying "URL copied" toast copying `""`.
4. `pnpm preflight` before push (affected typecheck+lint+boundaries+docs+changelog
   gate, base-pinned to `origin/main`). `preflight:full` for DB/accounting/RLS/Money.

**CI required checks** (merge blocks on any red) — the canonical list is
`docs/conventions/CI-POLICY.md` / CLAUDE.md → "CI / CD". Traps we/others have hit
(all in memory): `size-cap` **warns at 800, hard-fails at 2000** added lines —
plan for ≤ 800; the `size-cap-override` label is the human lever for a genuinely
atomic large PR. **Isolate cache-busters** (`tsconfig` / `turbo.json` /
`pnpm-lock.yaml`) into their own tiny PR first (they force a 32/32 cold rebuild).
Stacked PRs off a non-main base **skip** required checks (`stacked-pr-ci-gap`) —
verify locally and re-check after rebasing onto main (the branch must be **up to
date with main** to merge — the ruleset is strict). Required checks behind a
`paths` filter sit "Expected" forever (`required-check-path-filter-trap`). The PR
**title** is `conv-title`-gated (it becomes the squash commit); branch commit
**subjects** are commitlint-gated (`header-max-length` 100) and discarded on
squash. `changelog.d/` needs a **uniquely-named** fragment per PR
(`pnpm changelog:add`) — unique names are what let parallel PRs never collide.

**Parallel-agent hygiene (this guide's whole audience):** the shared archetype +
builders (`archetype-table.tsx`, `build-table-footer.ts`, `build-table-toolbar.ts`,
`inspector-rail.tsx`) are COMMON territory — two agents editing them concurrently
collide. Keep your page in its own route `_components/`; if you must change a
shared block, land it as its own tiny PR FIRST and rebase (same rule as
cache-busters — CLAUDE.md "Serialize parallel-worktree collisions"). Give each
in-flight PR non-overlapping file territory.

---

## 6. Case studies (the expensive lessons, so you skip them)

- **Search box "cropped on resize".** Root cause was NOT our revert failing — it
  was a merged commit (`#761`) that changed the search wrapper from a fixed `w-80`
  to `max-w-80 min-w-0 flex-1`. Reverting `content-toolbar/*` to `main` could not
  fix it because `main` already carried the regression. Our first "fix"
  (`w-80 shrink-0`) then **overlapped** the right cluster on a narrow panel
  (measured 131px). The correct fix was the true original `w-80` (no `shrink-0`):
  a stable 320px that still shrinks gracefully. **Lesson:** find the real origin
  with `git log -S`; a fixed-width element that cannot shrink WILL overlap or crop
  — pick graceful shrink over both.
- **"Settings" inspector tab.** We added a tab absent from the baseline.
  `git log -S Settings -- …/inspector-rail.tsx` shows we added it (`8efecb1a`) and
  reverted it (`4b5f63f7`); the baseline ended in "More". **Lesson:** diff against
  the true baseline before "restoring" anything — don't trust a remembered shape.
- **Export affordance churn (4 rounds).** dropdown → segmented group → split button
  → grouped split button. Each was us approximating the user's words. **Lesson:**
  match the named component; when the user links a shadcn example, open it.
- **Toast over the footer.** The Toaster already reads
  `--app-statusbar-clearance` (falls back to 24px). The footer publishes its height
  while shown and RESTORES the prior value on hide (a `TableStatusBar` may co-own
  the token). **Lesson:** a shared global needs save/restore ownership, not blind
  delete — the review caught the blind-delete regression.

---

## 7. Accounting domain + backend infra — what not to forget

If your page touches real data (not a dev reference):

- **Money is `Money<Currency>` (bigint minor units), stored `numeric(19,4)`.**
  Never native `number` for money. Cross-currency only via `FxRate.convert`.
  (CLAUDE.md → "Domain Rules".)
- **Multi-tenant isolation is FORCE RLS.** Every tenant table has
  `organization_id` + a pgPolicy on `current_setting('app.organization_id')`.
  Reads/writes go through `withWorkspace` / `withOrganization` / `withAdminBypass`.
  Cross-FK isolation needs a **composite** `(fk, organization_id)` (memory
  `postgres-fk-bypasses-rls`).
- **AI tool input schemas must NOT declare `organization_id` / `user_id` /
  `workspace_id` / `role`** — server-side injection only.
- **Tier scoping:** Brain memory/knowledge/OCR is workspace-scoped; booking is
  org-scoped (memory `afframe-workspace-vs-org-tenancy`). Don't cross tiers.
- **New public endpoint?** Follow the six-step "Endpoint Addition Rules"
  (schema → registry → controller → `pnpm gen:all` → E2E → `pnpm verify`); the
  `/add-endpoint` skill enforces it. Never hand-edit anything under `generated/`.
- **Reference names / i18n:** chart-of-accounts reference names come from a
  server-only generated catalog + `pickName`, never `name_<lang>` columns or
  `messages.json` (memory `chart-reference-name-i18n-mechanism`). Match the
  established mechanism for your surface; don't invent a new one.

---

## 8. When to escalate (and to whom)

- **Domain / correctness / safety uncertainty** (accounting rule, RLS, Money, a
  migration, "which of these?") → ask the user on his phone — it blocks for the
  answer:
  ```bash
  pnpm exec tsx apps/bot/scripts/ask.ts "<question>" --confirm --asker me
  ```
  (see CLAUDE.md → "Asking Hleb" for the option/text/resume-trigger variants), or
  escalate to the **Advisor** (latest Opus, xhigh, ×2 independent) for a second
  opinion. Memory `advisor-always-top-tier`, `advisor-brief-mandatory-on-uncertainty`.
- **Mechanical / CI / label** (rerun a failed job, add a fragment, a size-cap
  label) → resolve yourself (`feedback_full_auto_no_trivial_asks`).
- **Never** merge, deploy, force-push a shared branch, delete, run a migration, or
  start a dev server without an explicit yes (these are always-confirm gates,
  `/open-session`). "Yes to A" is not authorization for B (`feedback_disambiguate_yes`).

---

## 9. Adopt-this-checklist for a new page

1. Pick the archetype (`docs/specs/CONTENT-ARCHETYPES.md`); confirm allowed
   sections (`ARCHETYPE_SECTION_POLICY`).
2. Place the composition correctly (packages/ui vs the route's `_components/`).
3. Fill the mandatory chrome (`views`, `favorite`, `selectionActions`); use
   `buildTableToolbar` / `buildTableFooter`.
4. Compose Inspector tabs from `sectionInspector*`; no "Settings" tab.
5. Domain: Money/RLS/tenancy/tool-schema rules if touching real data.
6. Gates: typecheck → test → lint → build → browser-measure → thermo → security →
   preflight → CI. Fix every finding.
7. Respect the exact instruction; when unsure, STOP → ask / escalate / re-verify.
   Never substitute or hallucinate.

---

_This guide is descriptive. If you find it contradicts a source-of-truth file or
the code as shipped, trust the code and the SoT, and fix this guide._
