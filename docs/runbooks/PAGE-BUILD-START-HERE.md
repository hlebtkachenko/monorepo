# Building an `/o` page — start here

The cross-cutting spine every page-builder needs before touching a new
`/o/[orgSlug]` page: **build only in the new `o/[orgSlug]` tree** (the old
`[orgSlug]` tree is frozen and being deleted — never read or copy it), respect the
exact instruction, ship with no hallucinations, know where the rules live, pass
the verification/CI gates, and — because several agents build **in parallel** —
avoid colliding. Then it routes you to the two deep sub-guides for the mechanics.

> **Navigation only, not law.** Source-of-truth files win. This page can go
> stale; where it names a file, open that file. If this and the code (or an SoT
> doc) disagree, trust the code and fix this page. It is deliberately generic:
> your page will be its own domain, so this is **not a plan to execute** — it is
> the shared starting point, and you pick the two sub-guides that fit.

**You build in the NEW `o/[orgSlug]` tree — read its charter first.** The org UI
is a ground-up rebuild in a clean-room tree at `apps/web/app/o/[orgSlug]/`, behind
a temporary `/o` URL prefix. The old, frozen tree `apps/web/app/[orgSlug]/` is
**slated for deletion** — do not read it for examples, edit it, or backport
anything; its flat `_components/` + placeholder rows are exactly the redundancy
the rebuild drops. The canonical charter for adding a page / route / shell piece
is `apps/web/app/o/[orgSlug]/README.md` — **read it before you write.** Its rules,
all machine-gated by `pnpm --filter web lint:org-new` (`--max-warnings 0`):

- **The two trees never import each other**, and nothing outside imports the old
  one (`org-tree/no-cross-org-tree-import`). Shared code lives OUTSIDE both trees:
  `@workspace/*`, `apps/web/lib/org/*`, `apps/web/app/_lib/*` — never
  `app/[orgSlug]/*`.
- **No loose `_components/`.** Everything this tree owns is grouped under `_shell/`
  or `_nav/`, mirroring the `AppShell` anatomy
  (`_shell/app-body/app-content/content-body/…`) — enforced by
  `org-tree/no-loose-org-tree-folder` (memory `feedback-orgslug-shell-grouping`).
- **No demo / placeholder content** — every element is wired to real org data, or
  the body renders empty. No mock rows, fake text, or sample values, ever.
- **Every link goes through `orgHref`** (`@/lib/org/href`) so the `/o` prefix
  lives in one place for the flip.
- **Nav grows one module at a time** in `_nav/org-nav.ts`; during coexistence do
  NOT touch `scripts/gen-structure | check-nav | check-sitemap` or
  `PAGE_ANNOTATIONS` (keeps the drift checks green).

Only the **Table** archetype is wired in the new tree so far (reference:
`o/[orgSlug]/debug/archetype-table`). Needing one that isn't wired here is a
stop-and-ask (§7), never a copy from the frozen tree.

Distilled from two real campaigns (`#877` archetype pages, `#875`/`#882`
chart-of-accounts i18n). The two sub-guides carry the depth; this one carries the
map + the parts that only matter when many of us work at once.

---

## 1. The one spine (respect the exact instruction)

Most lost time on both campaigns came from turning the instruction into something
adjacent, or inventing a thing that never existed. One canonical statement:

> **Implement the instruction you were given, not the one you inferred.** Match
> the literal spec token by token ("button group" ≠ "dropdown" ≠ "split button").
> When you spot a real trade-off, **surface it and let the human choose** — never
> silently substitute your optimization. **Stop** and (a) ask, (b) escalate to the
> Advisor, or (c) re-verify against the code whenever the instruction is
> ambiguous, you are about to make a load-bearing choice, or you would deviate
> from something stated literally — a wrong multi-file build costs far more than
> one question. **Ship nothing you cannot verify** against git, live data, or
> CodeGraph; do not invent a prior reference, a feature, or a name. Give **one
> clear verdict**, don't flip-flop. **Report honestly** and name the failure chain
> when you get it wrong. Autonomy governs **mechanical** work (CI, labels, lint,
> obvious fixes) only — it never licenses reinterpreting a domain or design
> instruction.

Memory encoding this: `feedback-literal-spec-over-goal`,
`feedback_surface_consequential_assumptions`, `feedback_disambiguate_yes`,
`feedback_verify_before_claim`, `feedback_honest_root_cause`,
`feedback_full_auto_no_trivial_asks`.

_(Both sub-guides currently open with their own copy of this spine. This is the
canonical home; reducing each sub-guide's opener to a pointer up is a follow-up,
not this doc's job.)_

---

## 2. Where the rules live (navigate, don't reinvent)

**Precedence, highest first:** inline instruction in the current message → session
handoff `## Working Agreement` → `~/.claude/session-defaults.md` (repo
`.claude/session-defaults.md` if present) → global `~/.claude/CLAUDE.md` → project
`CLAUDE.md` / `AGENTS.md`. **Always-confirm gates (§7) outrank all of them.**

| You need…                                                   | Source of truth                                                                                                                                                                                                   |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Add a page / route / `_shell` piece in the new `o` tree** | `apps/web/app/o/[orgSlug]/README.md` (the tree charter) + memory `feedback-orgslug-shell-grouping`, `orgslug-rebuild`                                                                                             |
| App-shell, nav, content panels, add page/module/tabs        | `docs/runbooks/APP-SHELL-PANELS.md`                                                                                                                                                                               |
| The content archetypes + data contracts                     | `docs/specs/CONTENT-ARCHETYPES.md` (data contracts only — its `settings/debug/archetype-*` example paths are the frozen OLD tree; the sole wired reference is the new tree's `o/[orgSlug]/debug/archetype-table`) |
| Which sections an archetype body may host (tsc-enforced)    | `packages/ui/src/blocks/archetypes/archetype-section-policy.ts` + memory `archetype-section-governance`                                                                                                           |
| Shell tokens vs shadcn tokens (when to use which)           | CLAUDE.md "Component Design Rules" + memory `appshell-tokens-convention`                                                                                                                                          |
| Where a component lives (`packages/ui` vs `apps/web`)       | CLAUDE.md "Web App Component Placement" + `apps/web/app/_components/README.md` + memory `ui-belongs-in-packages-ui-blocks`                                                                                        |
| i18n mechanics (locales, parity, typing)                    | `packages/i18n/src/{config,global.d,catalog.test,server}.ts` + the i18n sub-guide                                                                                                                                 |
| Money / RLS / tenancy domain rules                          | CLAUDE.md "Domain Rules" + "Multi-tenant Isolation" + `ARCHITECTURE.md` + memory `postgres-fk-bypasses-rls`                                                                                                       |
| Migrations (handwritten SQL, drizzle-kit forbidden)         | CLAUDE.md + ADR-0009 + `packages/db/migrations/`                                                                                                                                                                  |
| PR workflow / size / squash / changelog fragments           | `docs/conventions/PR-WORKFLOW.md` + CLAUDE.md + `changelog.d/README.md`                                                                                                                                           |
| CI required vs advisory checks                              | `docs/conventions/CI-POLICY.md` (single source)                                                                                                                                                                   |
| Endpoint addition (the six steps)                           | `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`                                                                                                                                                                      |
| Session resume / autonomy / advisor / gates                 | `/open-session` + `/session-handoff` skills + `~/.claude/session-defaults.md`                                                                                                                                     |

---

## 3. Pick your path (the router)

The first decision. Read the sub-guide(s) that match your surface — don't
reconstruct their mechanics here:

- **UI / archetype surface only** (an archetype page: toolbar/footer builders,
  inspector tabs, section governance) →
  **[`ARCHETYPE-PAGE-BUILD-GUIDE.md`](ARCHETYPE-PAGE-BUILD-GUIDE.md)**.
- **You localize strings and/or adopt a SQL table into the domain** (migration,
  RLS, i18n, seeds, `/v1`) →
  **[`I18N-REFERENCE-DATA-LOCALIZATION.md`](I18N-REFERENCE-DATA-LOCALIZATION.md)**.
- **Most real pages need BOTH** — read them in that order (settle the backend/data
  contract first, then build the page on top).
- **Greenfield archetype:** in the new tree only the **Table** archetype is wired
  end-to-end (reference: `o/[orgSlug]/debug/archetype-table`, normal + pivot). The
  design system ships more archetype blocks (`ArchetypeBlank`, `ArchetypeDetails`),
  but a block existing ≠ a wired page — no new-tree page uses them yet, and the
  spec's **Launchpad / Dashboard / Single** (`docs/specs/CONTENT-ARCHETYPES.md`,
  #787) aren't built here at all. Needing an archetype that isn't wired in this
  tree yet is new chrome — a **stop-and-ask** (§7). Never copy a page from the
  frozen `[orgSlug]` tree.

---

## 4. Ship with no hallucinations (domain-agnostic core)

- **Verify against git / live data / CodeGraph, not memory.** `pnpm
codegraph:ready`, then `codegraph_explore` for structural questions before
  grep/read loops. A "regression" was root-caused only by `git log -S` on the
  exact class string.
- **Read the source before importing** — the export list is at the bottom of each
  component file (CLAUDE.md "Before Importing a Component"). Never guess an export.
- **Confirm a thing exists in the BASELINE before "restoring" it** (`git show` /
  `grep` / CodeGraph). We once "restored" an inspector Settings tab that had never
  existed in the baseline. In this tree, "baseline" is the NEW `o/[orgSlug]` tree —
  never the frozen old one.
- **Generate from the real source of truth; never hand-paste from a gitignored
  `.context/*.md` scratch doc** — an earlier pass did and pulled in ~21
  speculative/wrong names.
- **Prove UI claims by measurement** (`getBoundingClientRect`, read the actual
  exported CSV off the clipboard), never eyeball. Never auto-start a dev server (§6).
- **"Revert" means byte-for-byte** — `git checkout <ref> -- <path>`, prove it with
  an empty `git diff`, and confirm the ref you revert to actually predates the
  regression (it may live in an already-merged commit).
- Surface-specific hallucination traps (Pivot `toCsv` shape; next-intl `t.has` /
  strip-server-only-from-client) live in your sub-guide.

---

## 5. Parallel-agent collision hygiene (why this page exists)

Several agents build sibling pages at once. Nothing below is optional:

- **Declare your territory up front.** State your page's footprint — its route
  folder under `_shell/`, its migration number, its changelog fragment name — and
  check the open-PR list before writing. Give each in-flight PR **non-overlapping
  file territory**.
- **The shared blocks are common ground — change them in their own tiny PR FIRST.**
  (all under `packages/ui/src/blocks/`) `archetypes/archetype-table.tsx`,
  `content-panel/content-toolbar/build-table-toolbar.ts`,
  `content-panel/content-footer/build-table-footer.ts`,
  `inspector-sheet/inspector-rail.tsx`, `archetypes/archetype-section-policy.ts`.
  Land the shared-block change alone, merge, then every page rebases onto it.
  Never bundle a shared-block edit into a page PR — whoever squash-merges second
  silently reverts the other.
- **Isolate cache-busters** (`tsconfig` / `turbo.json` / `pnpm-lock.yaml` / root
  `package.json` / `eslint.config`) into their own tiny PR — they force a 32/32
  cold rebuild and the lockfile is a guaranteed conflict.
- **Sequential single-writer artifacts collide.** Migration numbers are the classic
  trap: two agents each read the tail of a **stale local `main`** and both claim the
  next number — this already happened (`0067_accounting_chart_directive_year.sql`
  **and** `0067_demo_debug_tables.sql` both exist). `git fetch origin main`
  immediately before numbering; land DDL first or claim a number range.
- **Regenerate conflict-magnets after a rebase; never hand-merge them.**
  `changelog.d/` is per-file now (safe), but single-file generated artifacts —
  `packages/db/schema-snapshot.sql`, `apps/api/openapi/v1.json`, `*.generated.*`,
  seed outputs — collide across agents. A hand-resolved merge passes **no** drift
  test; re-run the generator instead.
- **Branch-per-page, one concern, rebase onto `origin/main` before merge; never
  merge-clobber.** The branch must be **up to date with main** to merge (strict
  ruleset). Diff/compare against `origin/main`, never stale local `main`.
- **Stacked PRs give false green.** Stacking page-B on page-A to reuse a shared
  block means the heavy checks — `ci`, `lint`, `knip`, `boundaries`, CodeQL,
  `gitleaks` (required) plus advisory `e2e` — do **not** run against a non-main
  base and `mergeStateStatus` reads `CLEAN` anyway. Not verified: merge the parent
  → rebase the child onto main → re-check. (The local `size-cap` hook double-counts
  the parent — ignore a lone local size-cap fail on a stack.)

---

## 6. Verification gates + CI blockers (universal subset)

Run the ladder in order; don't claim done until each is green, and fix **every**
finding (even cosmetic — the user asks for those too):

1. `pnpm typecheck` → 2. `pnpm test` → 3. `pnpm lint` (0 errors) → 4. `pnpm build`
   (UI) → 5. **browser-measure** the UI → 6. `/thermo-review` → 7.
   `/security-review` → 8. `pnpm preflight` (`preflight:full` for
   DB/accounting/RLS/Money) → 9. CI green.

New-tree pages have one extra local gate: **`pnpm --filter web lint:org-new`**
(`--max-warnings 0`) — it fails on any cross-tree import or loose `_components/`.
Run it before you push.

Repo-wide CI facts every page hits (canonical list: `docs/conventions/CI-POLICY.md`):

- **`size-cap` warns > 800, hard-fails > 2000** added lines — plan ≤ 800. The
  `size-cap-override` label is the human lever for a genuinely atomic large PR only.
- **One uniquely-named changelog fragment per PR** (`pnpm changelog:add`) — docs,
  CI, infra count too. Never delete another PR's fragment.
- **PR title is `conv-title`-gated** (it becomes the squash commit). The scope
  allowlist does **not** include `accounting` — use `web` / `db` / `i18n` or no
  scope. Branch commit subjects are commitlint-gated (`header-max-length` 100) and
  discarded on squash.
- **Never auto-start a dev server** (it's Hleb's; memory `feedback_dev_port_3030`).
  Verify against **`$CONDUCTOR_PORT`** — a neighbouring port is a _different_
  workspace's code (we hit a 404 doing exactly this). Log in with the per-worktree
  seeded owner (memory `afframe-local-test-creds`).
- **CodeQL is enforced two ways:** the required status context `Analyze
(javascript-typescript)` (one of the 14), **plus** a separate code-scanning
  merge-protection rule that blocks any PR raising a medium-or-higher alert even
  when every status check is green. Sanitize any user-derived value reaching an
  anchor `href`/`src` through `new URL()` + a protocol allowlist (memory
  `feedback-codeql-catches-what-subagent-security-misses`).
- Surface-specific gates (i18n drift test, Case-A tenant-isolation test, Pivot CSV
  browser-measure) live in your sub-guide's checklist.

---

## 7. When to stop / ask / escalate

- **Always-confirm gates (override "auto", need an explicit yes):** merge to a
  shared branch · force-push · delete anything (→ `_junk/`, never permanent) ·
  deploy · DB migration against real data · any external send · anything touching
  secrets. **Accounting changes are additionally human-gated** — never merge
  accounting without Hleb's explicit go.
- **Advisor contract** (`session-defaults.md`, don't improvise): latest **Opus**,
  effort **`xhigh`**, **exactly 1** per review by default; spawn **2** only for a
  critical or genuinely complex decision needing two independent takes; never
  Fable, never lower, never > 2.
- **Escalate to the Advisor for:** complex tasks, review of a plan or your own
  suggestion, security-sensitive or load-bearing design choices.
- **Mechanical** (rerun a failed job, add a fragment, apply a size-cap label) →
  resolve yourself (`feedback_full_auto_no_trivial_asks`).
- **Ask Hleb** (blocks for the answer) for domain/correctness/safety uncertainty:
  `pnpm exec tsx apps/bot/scripts/ask.ts "<question>" --confirm --asker me` (see
  CLAUDE.md "Asking Hleb" for the option/text/resume variants).
- **"Yes to A" is not authorization for B** (`feedback_disambiguate_yes`).

---

## 8. Definition of done

1. Path picked (§3); both relevant sub-guides read.
2. **New-tree charter respected** (`apps/web/app/o/[orgSlug]/README.md`): page
   grouped under `_shell/` / `_nav/` (no loose `_components/`), links via
   `orgHref`, no placeholder content, no import of the frozen `[orgSlug]` tree —
   `pnpm --filter web lint:org-new` green.
3. Territory declared; no shared-block edit bundled into the page PR (§5).
4. The gate ladder is green and every finding is fixed (§6).
5. Stop/ask/escalate gates respected (§7) — nothing merged/deployed/force-pushed
   without an explicit yes.
6. Your sub-guide's own detailed checklist has been run.
7. The **exact instruction** is implemented — and where you were unsure, you
   STOPPED and asked / escalated / re-verified rather than guessing.

---

_Descriptive, not authoritative. If this contradicts the code or a source-of-truth
file, trust those and fix this page._
