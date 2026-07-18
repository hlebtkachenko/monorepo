# `/o/[orgSlug]` — rebuilt org UI (NEW tree)

This is the **ground-up rebuild** of the organization UI. It runs in parallel
with the frozen old tree at `apps/web/app/[orgSlug]/` behind a **temporary `/o`
URL prefix**. Do not treat this as permanent: at the flip it becomes the
canonical `/[orgSlug]` and the `/o` prefix disappears.

## The two trees

|                | Path                        | Status                                                                                                       |
| -------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------ |
| **NEW** (this) | `apps/web/app/o/[orgSlug]/` | Under active rebuild. Pages composed from Archetypes, wired to real backend.                                 |
| **OLD**        | `apps/web/app/[orgSlug]/`   | **Frozen.** Broken/bugged, kept only for reference until the new tree is done, then deleted. Do not edit it. |

## Rules (enforced)

1. **The two trees may never import each other.** The
   `org-tree/no-cross-org-tree-import` ESLint rule
   (`packages/eslint-config/rules/`) flags both directions. The **new → old**
   direction is the one that matters and is **hard-gated** in CI by
   `pnpm --filter web lint:org-new` (`eslint app/o --max-warnings 0`): green
   lint ⟺ the frozen old tree can be `rm -rf`'d without breaking this one.
   (old → new is advisory-only — the old tree is deleted at the flip anyway, so
   nothing depends on it staying clean.)
2. **Do not backport** old-tree changes or fixes into the new tree, and do not
   patch the old tree to match the new one. The old tree is disposable.
3. **Shared code lives outside both trees.** Import from `@workspace/*`,
   `apps/web/lib/org/*`, or `apps/web/app/_lib/*` — never from `app/[orgSlug]/*`.
4. **Every link goes through `orgHref`** (`@/lib/org/href`) so the `/o` prefix
   lives in exactly one place and the flip is a one-constant change.
5. **No demo / placeholder content.** Every displayed element is either wired to
   real org data (dynamic, as it would be for a real company) or empty. No mock
   rows, fake text, or hardcoded sample values — ever. A page with no designed
   content yet renders an empty body, not a placeholder.
6. **No loose `_components/` — everything this tree owns is grouped under
   `_shell/` or `_nav/`.** A flat `_components/` folder is the OLD tree's pattern
   and is forbidden at any depth. Page compositions live under the `_shell`
   anatomy (`_shell/app-body/app-content/content-header/` or `.../content-body/`),
   never a dumping folder. Enforced by `org-tree/no-loose-org-tree-folder` under
   the same `pnpm --filter web lint:org-new` (`--max-warnings 0`) gate as the
   wall — green lint ⟺ the layout matches this charter.

## What lives where

- **Shell** (`_shell/`): this tree's own thin clients over the `@workspace/ui`
  `AppShell` primitives — composed **directly**, not via the old flat
  `app/_components/org-shell.tsx`. The folder is organized to **mirror the
  AppShell anatomy** so every piece has an obvious home (no flat chaos):

  ```
  _shell/
    org-shell.tsx        root composer — mounts AppShell, wires the slots
    app-header/          header slot: org-switcher, period-switcher, header-actions
    app-rail/            rail slot                                   (add when built)
    app-body/            mirrors AppShell's AppBody region
      app-sidebar/       sidebar slot                               (add when built)
      app-content/       content-panel: content-header/, content-body/  (add when built)
      app-assistant/     assistant slot                             (add when built)
    app-bottom-nav/      mobile bottom nav                          (add when built)
  ```

  Only `_shell` needs the `_` prefix (Next-private folder); nested subfolders
  inherit it. Create a panel folder when its first file lands — don't commit
  empty folders. A new chrome piece goes under the panel it belongs to.

- **Nav**: `_nav/org-nav.ts` — this tree's own nav, starts minimal and grows one
  module at a time as pages are rebuilt. It does **not** feed the `/v1/structure`
  codegen during coexistence (that stays on the old nav until the flip).
- **Shared libs** (owned by neither tree): `apps/web/lib/org/` — `resolve` (slug
  gate + membership), `header` (shell header reads), `period` (URL-authoritative
  active-period resolver), `session`, `href`.
- **Period switch**: the URL (`?period=`) is authoritative; the cookie is only a
  sticky default. Pages read `searchParams.period` → `getActivePeriod`; the
  header switcher reads the live URL and pushes a new one on change.

## Guardrails during coexistence

- Never touch the three scripts that import the old nav (`scripts/gen-structure`,
  `scripts/check-nav`, `scripts/check-sitemap`) or add a new-tree route to
  `PAGE_ANNOTATIONS` — that keeps `structure-drift` / `nav-drift` / `sitemap-drift`
  green. All of that is repointed in one PR at the flip.
- `pnpm --filter web lint:org-new` lints this tree with `--max-warnings 0` (the
  clean room stays warning-free — including the no-cross-tree-import wall).

## The flip (later, one PR)

Delete the old tree, `git mv app/o/[orgSlug] → app/[orgSlug]`, set `ORG_PREFIX`
to `""`, un-reserve `o`, repoint the three nav scripts + regenerate
`/v1/structure`, and add a temporary `308 /o/:slug/* → /:slug/*` redirect.
