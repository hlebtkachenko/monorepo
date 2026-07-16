# `apps/web/app/_components/` — placement rule + single-use index

Web-app React compositions bound to routes + server data (NOT the app-agnostic
design system — that lives in `packages/ui`, enforced by the `ui-location`
lefthook hook). Two homes, decided by **how many routes consume the component**:

## The rule (read before adding a component)

- **Shared** — consumed by **≥2 routes** (or it's app-shell / nav chrome used by
  a whole tier): put it **here**, in `apps/web/app/_components/<name>/`.
- **Single-use** — consumed by **exactly one route**: put it in **that page's own
  `_components/` folder** (`apps/web/app/<...>/<page>/_components/<name>/`), and
  **add a row to the index below**.

When you add the **second** consumer to a single-use component, **promote** it:
move it here and delete its index row. Before creating a new single-use
component, scan the index — if a near-identical one already exists for another
page, prefer promoting that one to shared over writing a second.

Underscore (`_components`) keeps both out of Next.js routing.

## Single-use index

Page-local single-use components. Keep this current: add on create, remove on
promote/delete. (Empty rows are fine — the point is the discipline.)

| Component                                                   | Page folder | Purpose |
| ----------------------------------------------------------- | ----------- | ------- |
| _(none registered yet — new single-use components go here)_ |             |         |

## Legacy — single-use bodies still living in this folder

These are consumed by exactly one route today but predate the rule, so they sit
here instead of their page folder. **Relocate each to its page's `_components/`
the next time that page is touched** (or during its ArchetypeTable migration —
don't move-then-rewrite in two passes). Do not add more like these.

| Component              | Sole consumer                                     |
| ---------------------- | ------------------------------------------------- |
| `accounting-overview/` | `[orgSlug]/accounting/page.tsx`                   |
| `chart-of-accounts/`   | `[orgSlug]/accounting/chart-of-accounts/page.tsx` |
| `denik/`               | `[orgSlug]/accounting/journal/page.tsx`           |
| `documents-all/`       | `[orgSlug]/documents/page.tsx`                    |
| `documents-inbox/`     | `[orgSlug]/documents/inbox/page.tsx`              |
| `doklad/`              | `[orgSlug]/documents/doklad/page.tsx`             |

## Genuinely shared (stay here)

App-shell + nav chrome (`org-shell`, `org-sidebar`, `org-switcher`,
`period-switcher`, `org-header-actions`, `app-rail-nav`, `app-bottom-nav`,
`sidebar-module-title`, `workspace-shell`, `workspace-sidebar`, `workspace-nav`),
cross-feature helpers (`_shared`, `module-page`, `language-picker`), and
multi-route bodies (`ledger` → ledger + trial-balance; `documents-received` →
received + internal-documents; `saldokonto` → saldokonto + obligation-vouchers;
`held-writes` → approvals; the `workspace/*` bodies).
