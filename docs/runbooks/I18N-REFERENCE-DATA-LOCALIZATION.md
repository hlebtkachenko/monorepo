# Guide: localizing an accounting page (i18n + adopting SQL tables)

A **navigation guide**, not a rulebook. It points you to *where each rule is written* (so you
follow the source, not this page), helps you pick the right branch (case A vs case B), and — most
important — tells you *when to stop and ask Hleb / escalate to an Advisor* instead of guessing.
Distilled from the chart-of-accounts work (PRs #875 + #882), including the mistakes, so you skip
the log-research we did.

> This guide can go stale. Where it names a source-of-truth file, **open that file** — it wins over
> this page. If this guide and a real file disagree, trust the file and fix this guide.

---

## 0. The meta-rule: implement the instruction Hleb gave, not the one you inferred

This is the lesson that cost the most this session. Read it first.

- **Literal wording > your idea of the goal.** When Hleb said *"use i18n"*, the correct move was to
  use the existing next-intl system. Instead an earlier pass built a *parallel* name catalog to
  save client-bundle bytes — substituting its own optimization for his instruction. That triggered
  several rounds of rework and frustration. (Rule: `feedback-literal-spec-over-goal`,
  `feedback-ground-in-existing-before-redesign`.)
- **When you spot a real trade-off, SURFACE it — don't silently pick.** "Names in messages.json add
  ~20 KB to the client bundle" was a real concern. The move is to *say that to Hleb and let him
  choose*, not to quietly build the thing he didn't ask for and call it done.
- **Stop-and-ask beats guess** in any of these cases:
  - the instruction is ambiguous or under-specified,
  - you are about to make a **load-bearing interpretation** (a choice the rest of the work hangs on),
  - you would **deviate** from something he said literally,
  - the step is on the **always-confirm** list (§4).
  Your options when you stop: **ask Hleb** (blocking, `apps/bot/scripts/ask.ts` — see AGENTS.md
  "Asking Hleb"), **escalate to the Advisor** (§4), or **re-check against the codebase**. Any of the
  three beats inventing a version.
- **Give one clear verdict; do not flip-flop.** Saying "I did shit" → "it's sound" → "it's hardcoded"
  across three turns reads as noise. If you revise a conclusion, say *what changed and why* in one
  line.
- **Report honestly.** Never call something "sound / done right" if it violates a rule Hleb stated
  (e.g. calling the parallel catalog "faithful" while it broke "use i18n"). (Rule:
  `feedback_verify_before_claim`, `feedback_honest_root_cause`.)
- **The balance with "be autonomous".** Session-defaults say *auto, don't re-ask settled things,
  drive to green*. That governs **mechanical** work (CI, labels, lint, refactors, obvious fixes —
  `feedback_full_auto_no_trivial_asks`). It does **not** license reinterpreting a domain/design
  instruction. Mechanical → decide yourself. Domain / design / ambiguous-instruction / irreversible
  → stop and confirm.

---

## 1. Where our rules live (source-of-truth map)

Navigate here first; don't reconstruct a rule from memory.

**Precedence (highest first):** inline instruction in the current message → session handoff
`## Working Agreement` → `~/.claude/session-defaults.md` (repo `.claude/session-defaults.md` if
present) → global `~/.claude/CLAUDE.md` → project `CLAUDE.md` / `AGENTS.md`. **Always-confirm gates
(§4) outrank all of them.** (Chain defined in `open-session` SKILL + session-defaults.)

| Rule area | Where it's written | Note |
|---|---|---|
| i18n mechanics (locales, parity, typing) | `packages/i18n/src/{config.ts, global.d.ts, catalog.test.ts, request.ts, server.ts}` + this runbook | strict-typed catalogs |
| Multi-tenant isolation / RLS | project `CLAUDE.md` "Multi-tenant Isolation" + memory `postgres-fk-bypasses-rls` | GUC `app.organization_id` |
| Money / domain rules | project `CLAUDE.md` "Domain Rules" + `ARCHITECTURE.md` | `Money<Currency>`, never `number` |
| Migrations | project `CLAUDE.md` + ADR-0009 (handwritten SQL, drizzle-kit forbidden) | `packages/db/migrations/` |
| PR workflow / size / squash | `docs/conventions/PR-WORKFLOW.md` | small, single-concern |
| CI required vs advisory | `docs/conventions/CI-POLICY.md` | 14 required contexts |
| Endpoint addition (the 6 steps) | `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md` | drift-gated codegen |
| Releases / tagging | `docs/conventions/RELEASES.md` | human-gated |
| Changelog fragments | `changelog.d/README.md` | one per change |
| Autonomy / advisor / gates | `~/.claude/session-defaults.md` | see §4 |
| Session resume / handoff | `open-session` + `session-handoff` skills; `.context/handoffs/` | Conductor-aware |

---

## 2. Adopting a SQL table into the accounting domain + back-end infra — what to not forget

The decision that shapes everything: **is this a tenant table or a reference/config table?** Pick
before you write the migration.

- **Case A — tenant data** (a specific org's rows, e.g. `account`, an org's forked chart): MUST have
  `organization_id` + **FORCE RLS** + a `pgPolicy` using `current_setting('app.organization_id')`.
  Read/write only through `withOrganization` / `withOrgReadonly` / `withAdminBypass`. Cross-FK
  isolation needs a **composite FK `(fk, organization_id)`** — a plain FK bypasses RLS
  (`postgres-fk-bypasses-rls`).
- **Case B — shared reference/config** (statutory catalogues used by everyone, e.g.
  `directive_account`, `chart_template`, `chart_template_account`, `directive_account_year`): **no
  `organization_id`, no RLS — intentionally.** The security review confirmed this is correct *because
  the parent reference table (`directive_account`) follows the same pattern*. When in doubt whether a
  table is A or B, that's a domain call → confirm, don't assume RLS is "missing".

Then, the full pipeline from table to page. The two steps an earlier reviewer noticed we'd skipped
in an early plan are marked ★ — they are the ones people forget:

1. **Write the migration** — handwritten SQL in `packages/db/migrations/`, **sequentially numbered**
   (check the latest number first: we shipped a stale `Mirrors: 0066` doc-comment when the DDL was
   `0067` and the seed `0068`). `drizzle-kit generate` / `push` are **forbidden** (ADR-0009 — read
   it). DDL and seed as separate migrations. Apply/verify locally through the migration runner
   (`packages/db` `apply-migrations` + the `_app_migrations` journal); never edit an applied
   migration (forward-fix only).
2. ★ **Register the drizzle types-only schema** at `packages/db/src/schema/<table>.ts` (the file whose
   `Mirrors:` comment points at the migration) and export it from `packages/db/src/schema/index.ts`.
   Without this the domain layer cannot query the table.
3. **Regenerate `packages/db/schema-snapshot.sql`** (from CI's `pg_dump` artifact, not by hand) or the
   `db-schema-drift` check fails.
4. ★ **Add the domain reads/seeds in `@workspace/accounting`** (e.g. `listChartTemplates`,
   `listDirectiveYear`, `seedChartFrom*`) — the single-source reads the app-edge and `/v1` both call.
   Reads go through `withOrgReadonly`, writes through `withOrganization`. This layer, not the
   app-edge, is where "adopting the table into the accounting domain" actually happens.
5. **App-edge** (`apps/web/lib/org/<domain>.ts`): camelCase view models + presentation only, no SQL.
6. **Seeds that feed the domain**: generator script + committed output + **idempotent** re-run (verify
   `git status` clean) + a **drift test** (nothing in CI auto-regenerates a seed).
7. **The domain conventions themselves** — snake_case, full words (no `acc_`/`inv_`), Money as
   `Money<Currency>` never native `number`, composite FK `(fk, organization_id)` for cross-tenant
   isolation — are written in project `CLAUDE.md` "Domain Rules" + `ARCHITECTURE.md` +
   memory `postgres-fk-bypasses-rls`. Read them there; don't reconstruct from this page.
8. **`/v1` endpoints**: never accept `organization_id` / `user_id` / `workspace_id` / `role` in the
   request — principal-injected only. Full procedure: `docs/runbooks/ENDPOINT-ADDITION-RUNBOOK.md`.

---

## 3. Shipping i18n with no hallucinations

Hallucination here means: names invented, or copied from a source that isn't the truth.

- **Generate from the real source of truth, and verify it exists first.** For chart of accounts:
  the vendored seed JSON (`packages/db/seeds/chart_template.2026.money.json`) and the frozen reference
  migration (`packages/db/migrations/0026_accounting_reference_seed.sql`). **Never hand-paste from a
  gitignored `.context/*.md` "prepared catalogue"** — an earlier pass did exactly that
  (`.context/ui-column-names.md`) and pulled in 38 keys, ~21 of them speculative/wrong. If you catch
  yourself typing a name a human wrote in a scratch doc, stop.
- **Generated, not hand-authored.** Committed output, idempotent generator, plus a **drift test** that
  independently re-derives from the sources and asserts the committed catalogs match
  (`packages/i18n/src/account-names.test.ts`). The gen-time asserts only fire when a human re-runs;
  the test is what catches a source edit shipped without regeneration.
- **The correct mechanism** (copy `packages/db/scripts/gen-chart-template-seed.ts`):
  1. Names live in `packages/i18n/src/messages/{en,cs}.json`, keyed by stable code (e.g.
     `accounting.chartOfAccounts.osnovaNames.<code>`). **Not** per-language DB columns. **Not** a
     bespoke catalog. **Not** a hardcoded `locale === "en" ? … : cs` branch — an earlier pass
     shipped exactly that (and a `pickName` helper around it) and had to rip it out; same class of
     miss as the parallel catalog in §0. Resolve by key and let next-intl pick the locale.
  2. **One namespace per context that can disagree on a code.** We needed two (`osnovaNames` legal,
     `templateNames` Money) — 204 of 207 shared codes had *different* names. Check before assuming one.
  3. Resolve server-side by key: `getTranslations(ns)`; `t.has(key) ? t(key) : storedFallback`.
     Dynamic key needs the repo cast `code as Parameters<typeof t>[0]` (precedent:
     `apps/web/app/workspace/organizations/new/create-org-wizard.tsx`). `t.has` is **load-bearing** —
     next-intl `t(missingKey)` returns the raw key-path in prod, it doesn't throw.
  4. **Gen-time guards**: trim names (vendored data has trailing spaces), reject keys containing `.`
     (next-intl treats `.` as a path separator — dotted analytic codes would nest and never resolve),
     dedup **first-wins** to mirror the DB's `ON CONFLICT`, fail loud on an unexpected source row.
  5. **Server-only names must not ship to the client.** If resolution is server-only, strip those
     namespaces from `NextIntlClientProvider` in `apps/web/app/layout.tsx` (it ships the whole
     active-locale catalog to every route; ours were ~20 KB / ~40 % of `en.json`).
- **next-intl invariants to respect**: strict typing (`Messages = typeof en`, `global.d.ts`); en↔cs
  key parity + ICU + no-empty enforced by `catalog.test.ts`; add-a-locale for hand-authored strings =
  `config.ts` entry + a `<code>.json`, **zero code change**. **Caveat**: that zero-code property does
  NOT yet extend to the generated name namespaces — the generator hardcodes `["en","cs"]`
  (`gen-chart-template-seed.ts`), so a third locale also needs that loop extended and its source
  names supplied. Preserve the property where you can, and know where it stops.
- **Tenant/user-entered names stay untranslated in the DB** (a forked chart's `account.name` is user
  content; localizing it would clobber edits).

---

## 4. Escalation, gates, and the Advisor contract (respect these exactly)

- **Advisor contract (from `session-defaults.md` — do not improvise):** **exactly 1 Advisor per
  review by default.** Spawn **2** *only* for a critical decision or genuinely complex problem where
  two independent takes must be compared (e.g. the reference-name mechanism choice; this guide
  recheck). **Never more than 2, never 2 for a routine review.** Model = **latest Opus**, effort =
  **`xhigh`**, never Fable, never lower.
- **Escalate to the Advisor for**: complex tasks, plan/own-suggestion review, critical or
  security-sensitive changes, and any load-bearing design decision (§0).
- **Always-confirm gates (override "auto", need an explicit yes):** merge to a shared branch ·
  force-push · delete anything (move to `_junk/`, never permanent) · deploy · DB migration against
  real data · any external send · anything touching secrets. Accounting changes are additionally
  human-gated — never merge without Hleb's explicit go.
- **Autonomy otherwise**: drive a coding task push → PR → CI-green without check-ins; **stop at
  green**, never merge on your own. Caps: no Fable, effort ∈ {medium, high, xhigh}, ≤3 parallel
  subagents.
- **Resuming a paused session** (`/open-session`): read the newest handoff from
  `.context/handoffs/` (Conductor) or `.claude/handoffs/` (plain repo), sync the base branch
  (`origin/main` / `$CONDUCTOR_DEFAULT_BRANCH`), and **restore its `## Working Agreement`** before
  touching anything — that agreement (overlaid by session-defaults for any `default` line) is what
  re-establishes autonomy, advisor, merge, and gate policy for the session. Save state with
  `/session-handoff` before you `/compact` or pause.

---

## 5. CI blockers you will hit (repo-specific, verified this session)

- **Stacked PR (base ≠ `main`) skips the heavy required checks.** GitHub runs only a handful and
  shows `mergeStateStatus: CLEAN` — misleading. `ci`, `lint`, `knip`, `boundaries`, CodeQL,
  `gitleaks`, `e2e` do **not** run against a non-`main` base. It is **not** truly verified until it
  sits on `main`: merge the parent, rebase onto `main`, *then* the real checks run. Verify locally
  meanwhile. (Memory: `stacked-pr-ci-gap`.)
- **`size-cap`: local hook ≠ GitHub check.** The pre-push lefthook measures the whole branch vs
  `main`, so a stacked branch double-counts the parent and false-fails "over cap". GitHub's
  `size-cap` measures the PR vs its base (the real gate). If the *only* pre-push failure is
  `size-cap` on a stacked branch and everything else passed, the push is fine. `size-cap-override`
  label is for genuine codegen bulk only.
- **`conv-title` scope allowlist**: `accounting` is **not** allowed. Use `web` / `db` / `i18n` or no
  scope. Enforced by the pre-push `pr-title` hook and CI.
- **Conductor**: diff/compare against `origin/main`, never local `main` (stale). Never direct-push
  `main`. Force-push after a rebase is an always-confirm gate.
- **Changelog fragments** are per-file now (no shared block) — parallel PRs don't collide. One
  fragment per change (`pnpm changelog:add`); never delete another PR's fragment.

---

## 6. Verification checklist (all green before you push)

- [ ] `pnpm --filter @workspace/i18n test` — parity + ICU + your drift guard.
- [ ] `pnpm --filter <pkg> typecheck` **and** `pnpm --filter web typecheck` — the strict-typed
      dynamic-key cast + `t.has` must compile.
- [ ] Domain / app-edge tests green.
- [ ] Generator **idempotent** (re-run → `git status` clean); generated SQL seed unchanged if only
      names moved.
- [ ] `pnpm preflight` green (affected typecheck + lint + boundaries + docs + changelog gate).
- [ ] One `changelog.d/*` fragment.
- [ ] For a **Case A (tenant) table**: a tenant-isolation test proving one org cannot read/write
      another's rows (two seeded orgs; the reference-name work touched only Case B tables, so it had
      none — yours will if you add tenant data).
- [ ] `/security-review` (this feature type is usually clean — confirm: no per-language column, no
      tenant-table missing RLS, no request input into the generator, parameterized reads).
- [ ] `/thermo-review` for generator + resolution correctness/maintainability. (Note: the
      `thermo-review` workflow can fail on an infra error — a `StructuredOutput` retry-cap in its
      gate — independent of your code; resume it or fall back to a manual Advisor review.)

---

## 7. File map (real anchors from #875 + #882)

| Concern | File |
|---|---|
| Locale registry / add-a-language | `packages/i18n/src/config.ts` |
| Message catalogs | `packages/i18n/src/messages/{en,cs}.json` |
| Strict typing | `packages/i18n/src/global.d.ts` |
| Parity / ICU guard | `packages/i18n/src/catalog.test.ts` |
| Generic server-side next-intl re-export | `packages/i18n/src/server.ts` (NOT where name resolution lives — the app-edge imports `getTranslations` straight from `next-intl/server`, see the row below) |
| Client provider payload (strip server-only) | `apps/web/app/layout.tsx` |
| Reference-name generator (copy) | `packages/db/scripts/gen-chart-template-seed.ts` |
| Drift guard (copy) | `packages/i18n/src/account-names.test.ts` |
| App edge that resolves names | `apps/web/lib/org/accounting.ts` |
| Dynamic-key cast precedent | `apps/web/app/workspace/organizations/new/create-org-wizard.tsx` |
| Reference-table RLS precedent | `packages/db/schema-snapshot.sql` (`directive_account`) |
</content>
