# Statutory Closing Remediation History

> **Status:** completed 2026-07-09 and issue
> [#625](https://github.com/hlebtkachenko/monorepo/issues/625) closed. Read-only
> cross-PR implementation and acceptance history.

> **Purpose:** Define the implementation territory and acceptance criteria for [remediation issue #625](https://github.com/hlebtkachenko/monorepo/issues/625), correcting the statutory closing work introduced across [PR #593](https://github.com/hlebtkachenko/monorepo/pull/593), [PR #594](https://github.com/hlebtkachenko/monorepo/pull/594), [PR #598](https://github.com/hlebtkachenko/monorepo/pull/598), [PR #601](https://github.com/hlebtkachenko/monorepo/pull/601), [PR #605](https://github.com/hlebtkachenko/monorepo/pull/605), [PR #609](https://github.com/hlebtkachenko/monorepo/pull/609), and [PR #612](https://github.com/hlebtkachenko/monorepo/pull/612).
>
> **Snapshot:** 2026-07-09. Implementation started from `origin/main` at
> `53969eb`. This is a stable cross-PR reference. Execution status, assignees,
> and merge state belong in the linked remediation PRs and GitHub Project.

## Execution status

Implementation completed on 2026-07-09. Final combined verification and remote
CI promotion are tracked in Milestone 7.

| Milestone                                          | Delivery PR                                                | Status                |
| -------------------------------------------------- | ---------------------------------------------------------- | --------------------- |
| 0-1: baseline, ADR, statutory periods, legal dates | [#626](https://github.com/hlebtkachenko/monorepo/pull/626) | Implemented, CI green |
| 2: effective profiles and obligation truth model   | [#628](https://github.com/hlebtkachenko/monorepo/pull/628) | Implemented, CI green |
| 3: VAT obligation and output correctness           | [#630](https://github.com/hlebtkachenko/monorepo/pull/630) | Implemented, CI green |
| 4: payroll obligation correctness                  | [#631](https://github.com/hlebtkachenko/monorepo/pull/631) | Implemented, CI green |
| 5: annual tax and year-end truthfulness            | [#632](https://github.com/hlebtkachenko/monorepo/pull/632) | Implemented, CI green |
| 6: workspace and canonical configuration           | [#629](https://github.com/hlebtkachenko/monorepo/pull/629) | Implemented, CI green |
| 7: combined review, verification, and PR readiness | [#633](https://github.com/hlebtkachenko/monorepo/pull/633) | Implemented, CI green |

The checkbox lists below remain the acceptance checklist and design history.
The table above is the authoritative execution status.

Reviewed merge set:

| PR   | Merge SHA  | Scope                                                     |
| ---- | ---------- | --------------------------------------------------------- |
| #593 | `ebdee8e1` | Active accounting period in organization data             |
| #594 | `b397ae83` | Number-series settings and restore-defaults backfill      |
| #598 | `8e6f9214` | Statutory obligation engine and Closing overview/calendar |
| #601 | `57a15c02` | Filing-period-aware VAT builders and Closing VAT pages    |
| #605 | `b5c46c10` | Income tax and year-end statements                        |
| #609 | `9cb358a7` | Organization tax profile and payroll                      |
| #612 | `b884735f` | Workspace companies and legislation data                  |

## Deliverable goal

Deliver a reviewable stack of remediation PRs that fixes every confirmed statutory closing defect, includes safe database migrations and regression coverage, and is ready to merge in documented dependency order.

Execution is autonomous after plan approval. Each branch must be pushed, each PR must pass every required GitHub Actions check, and each PR must be marked ready for review. The agent may rebase or update stacked branches and fix CI failures without another design checkpoint when the action stays within this plan.

**Do not merge any remediation PR.** The final deliverable is a green, ready-for-review PR stack. Merge authority remains with Hleb.

## Scope boundary

This remediation makes implemented calculations and labels truthful. It does not invent accounting or tax facts that the ledger and organization configuration cannot prove.

- Unsupported statutory fields become explicit `needs input` or `unsupported` states.
- Unknown facts remain unknown. They are not converted to `false`, zero, or an assumed default.
- Partial worksheets are not represented as complete statutory returns or approved financial statements.
- Full EPO/XML generation, validation, signing, and submission for every Czech statutory return are excluded.
- Broader accounting product features unrelated to the reviewed PRs are excluded.
- Existing user data is preserved. A migration may mark data incomplete, but must not fabricate legal dates, filing state, taxpayer category, or payroll participation.

## Remediation PR stack

The implementation is split into seven reviewable PRs. Each PR must independently pass CI. Later PRs may be stacked while earlier PRs await review.

| PR  | Proposed title                                                           | Scope                                                              | Dependency      |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------ | --------------- |
| 1   | `fix(accounting): model statutory periods and legal dates`               | Statutory periods, legal dates, cross-accounting-period evidence   | `main`          |
| 2   | `refactor(accounting): separate schedules from actual obligations`       | Effective profiles, obligation truth model, filing state boundary  | PR 1            |
| 3   | `fix(accounting): correct VAT filing obligations and outputs`            | VAT DAP, KH, SH, identified-person behavior                        | PR 2            |
| 4   | `fix(accounting): model payroll obligations from monthly facts`          | Payroll evidence, participation, tax kinds, deadlines              | PR 2            |
| 5   | `fix(accounting): make annual outputs historically correct and explicit` | DPPO, DPFO, year-end statements, completeness                      | PR 2            |
| 6   | `fix(web): unify statutory obligation surfaces`                          | Workspace integration, settings, configuration, final cleanup      | PRs 3, 4, and 5 |
| 7   | `fix: close statutory review gaps`                                       | Cross-cutting reviewer findings, public contracts, final hardening | PR 6            |

If implementation exposes an inseparable database or type dependency, adjacent PRs may be combined. The resulting stack must remain small enough to review, preserve the dependency order above, and explain the deviation in the PR description.

## Engineering principles

- Separate accounting periods from statutory tax periods.
- Represent Czech legal dates as dates, not instants inferred through a database or browser timezone.
- Resolve effective-dated facts for each affected interval, not once for an entire accounting year.
- Separate possible schedules, applicable obligations, filing/payment records, and presentation status.
- Keep one canonical predicate for each legal classification used by multiple outputs.
- Attach an effective date, verified source, and source version to legal rates, thresholds, and deadlines.
- Fail closed when evidence is incomplete.
- Preserve organization isolation through `organization_id`, FORCE RLS, and scoped database helpers.
- Use repository design tokens and canonical configuration instead of hardcoded UI or policy values.
- Add the fastest meaningful tests at the domain boundary, then integration tests for database and surface agreement.

## Milestone 0: Baseline and regression harness

### TODO

- [ ] Record the reviewed merge SHAs and the implementation base SHA in the first remediation PR.
- [ ] Map every confirmed finding to its production path, caller, and existing test coverage.
- [ ] Add an ADR defining accounting period, statutory period, legal date, effective fact, schedule candidate, applicable obligation, filing record, and presentation status.
- [ ] Add failing regression tests for every P1 finding before changing the corresponding behavior.
- [ ] Add focused regression tests for the confirmed P2 findings covered by this plan.
- [ ] Record official Czech primary sources and their verification dates next to the legal rules they support.
- [ ] Identify legacy records for which legal dates, taxpayer category, payroll participation, or filing state cannot be reconstructed safely.
- [ ] Define conservative behavior for incomplete legacy records.
- [ ] Capture representative current Closing and Workspace output so changed labels and states can be compared.
- [ ] Verify the baseline accounting, web, database, API, boundary, lint, and typecheck commands before implementation.

### Acceptance criteria

- Every P1 finding has a regression test that fails for the intended reason on the baseline.
- The ADR makes ownership and conversion boundaries explicit.
- No proposed migration depends on inferred legal facts.
- The local baseline and exact verification commands are documented in the first PR.

## Milestone 1: Statutory periods and legal dates

Target: PR 1.

### TODO

- [ ] Introduce a calendar-aligned statutory filing-period type independent of `accounting_period`.
- [ ] Make organization and statutory date range the canonical evidence-query boundary for VAT outputs.
- [ ] Aggregate evidence across every accounting period that overlaps a statutory filing period.
- [ ] Remove accounting-period clipping from quarterly VAT periods.
- [ ] Model the taxable-supply date separately from the document-receipt or deduction-eligibility date.
- [ ] Store new Czech legal dates in PostgreSQL `date` columns.
- [ ] Remove session-dependent `timestamptz::date` conversions from affected VAT queries.
- [ ] Introduce one Czech-local date provider for application `today` calculations.
- [ ] Replace duplicated UTC ISO-date slicing in Closing, VAT, Payroll, Workspace, and Legislation loaders.
- [ ] Add safe, idempotent migrations with organization scoping, FORCE RLS, indexes, checks, and rollback notes.
- [ ] Preserve legacy rows with unknown receipt dates as incomplete and ineligible for an asserted deduction until resolved.
- [ ] Add tests for calendar years, non-calendar fiscal years, quarters crossing two accounting periods, leap years, daylight-saving boundaries, and database session timezones.

### Acceptance criteria

- A statutory VAT quarter remains a complete calendar quarter regardless of the active fiscal year.
- January evidence is included in Q1 when the active accounting year starts in February.
- Received-invoice deductions cannot be assigned before proven deduction eligibility.
- Changing the PostgreSQL session timezone does not change a legal date or filing-period result.
- All affected UI paths derive `today` through the same Czech-local provider.
- Migration tests prove tenant isolation and conservative handling of legacy data.

## Milestone 2: Effective profiles and obligation truth model

Target: PR 2.

### TODO

- [ ] Replace the single annual VAT and payroll profile result with effective-dated timelines.
- [ ] Split calculation intervals at every relevant VAT registration, filing cadence, taxpayer type, and payroll fact boundary.
- [ ] Define distinct domain types for schedule candidates, applicability decisions, conditional obligations, filing/payment records, and UI status.
- [ ] Preserve `unknown` for missing profile data instead of converting it to `false` or nonpayer.
- [ ] Require an evidence or configuration reason for each applicability decision.
- [ ] Remove `Overdue` status when no filing or payment record proves non-compliance.
- [ ] Use truthful alternatives such as `Past due date`, `Upcoming`, `Needs input`, and `Condition not evaluated`.
- [ ] Centralize effective-profile resolution for organization and workspace consumers.
- [ ] Remove duplicate `pickEffective` and equivalent latest-overlap logic.
- [ ] Define deterministic behavior for overlapping or conflicting profile rows and reject invalid writes at the database boundary where possible.
- [ ] Add tests for mid-month and mid-year registration, deregistration, filing-cadence change, employee-fact change, missing profiles, conflicting profiles, and historical periods.

### Acceptance criteria

- A July VAT registration produces no VAT-payer obligation for January through June.
- A later deregistration does not erase obligations from the registered interval.
- Payroll fact changes affect only their effective intervals.
- Missing configuration is visible and never means no obligation.
- Organization and workspace callers receive the same canonical domain results.
- A due date alone cannot produce an `Overdue` status.

## Milestone 3: VAT obligation and output correctness

Target: PR 3.

### TODO

- [ ] Make KH applicability depend on reportable transaction evidence for the statutory period.
- [ ] Preserve correct KH cadence for legal persons and natural persons.
- [ ] Exclude identified persons from KH applicability.
- [ ] Derive SH cadence from VAT filing period and actual qualifying supply categories.
- [ ] Support quarterly SH for an eligible quarterly payer with service-only qualifying supplies.
- [ ] Switch to monthly SH when qualifying goods supplies require it.
- [ ] Model identified-person obligations as event-driven where the law requires activity evidence.
- [ ] Apply document-receipt or deduction-eligibility dates to input VAT inclusion.
- [ ] Consolidate shared DAP, KH, and SH transaction-classification predicates.
- [ ] Audit every implemented VAT line against a dated primary source.
- [ ] Mark every unavailable line or classification as `needs input` or `unsupported`.
- [ ] Add an explicit completeness result to each VAT artifact.
- [ ] Rename partial artifacts and UI labels where they are not complete statutory returns.
- [ ] Add reconciliation invariants between DAP, KH, and SH classifications.
- [ ] Add tests for no activity, domestic supplies, received invoices, late receipt, EU goods, EU services, domestic reverse charge, corrections, identified persons, registration changes, quarterly cadence, and cross-fiscal-year evidence.

### Acceptance criteria

- No nil KH is asserted as a mandatory filing.
- KH cadence follows organization type and VAT filing-period rules.
- SH cadence follows qualifying supply evidence, including the quarterly service-only case.
- Identified-person behavior is not treated as standard VAT-payer behavior.
- DAP, KH, and SH cannot disagree because separate code paths classified the same evidence differently.
- A partial VAT result cannot be presented as filing-complete.

## Milestone 4: Payroll obligation correctness

Target: PR 4.

### TODO

- [ ] Retire `hasEmployees` as the sole payroll-obligation decision input.
- [ ] Introduce effective-dated monthly payroll facts sufficient to decide each supported obligation.
- [ ] Distinguish social insurance, health insurance, payroll tax advances, and special-rate withholding tax.
- [ ] Give each obligation kind its own effective-dated deadline rule.
- [ ] Represent DPP and DPČ insurance participation facts explicitly.
- [ ] Represent employment start and end dates without applying them to unrelated months.
- [ ] Support months with employees but no remittance for a specific obligation kind.
- [ ] Backfill existing organizations to `unconfigured` when required facts are absent.
- [ ] Add the minimum Settings inputs needed to make supported payroll decisions.
- [ ] Attach source metadata and effective dates to payroll thresholds.
- [ ] Avoid deriving current thresholds for historical months.
- [ ] Add tests for DPP, DPČ, threshold boundaries, employment start and end, zero remittance, payroll tax advance, special-rate withholding, insurance participation, profile changes, and unknown configuration.

### Acceptance criteria

- The engine never emits all payroll obligations solely because one employee exists.
- Payroll tax advances are not represented as special-rate withholding tax.
- Social and health obligations follow proven participation facts.
- Historical calculations use the threshold and deadline rules effective in their month.
- Unknown payroll configuration is visible in organization and workspace views.

## Milestone 5: Annual tax and year-end output truthfulness

Target: PR 5.

### TODO

- [ ] Resolve the DPPO rate from the taxable period and taxpayer category.
- [ ] Support the historically applicable 19 percent and 21 percent standard rates.
- [ ] Represent special taxpayer categories and rates explicitly when supported.
- [ ] Separate book-derived tax-base values from advisor or user-provided adjustments.
- [ ] Require provenance for DPPO adjustments, reliefs, carried losses, credits, advances, and withholding.
- [ ] Stop defaulting unknown statutory inputs to zero.
- [ ] Add an explicit completeness and blocking-input result to DPPO.
- [ ] Rename the current DPFO calculation to a Section 7 tax-record worksheet.
- [ ] Prevent the Section 7 worksheet from being presented as a complete personal income-tax return.
- [ ] Add explicit completeness state to supported DPFO-related outputs.
- [ ] Rename incomplete financial statements to draft closing worksheets where appropriate.
- [ ] Add prior-period comparative values when the ledger can prove them.
- [ ] Add asset gross, correction, and net columns where supported by account data.
- [ ] Expose missing notes, approval, signature, publication, and other statutory completion requirements.
- [ ] Remove claims such as `full statutory line set` when completeness cannot be proven.
- [ ] Add tests for 2023, 2024, 2026, non-calendar years, taxpayer categories, losses, adjustments, reliefs, advances, missing inputs, comparative periods, and incomplete statements.

### Acceptance criteria

- A historical period cannot silently use the current DPPO rate.
- A taxpayer category with a different rate cannot silently receive the standard rate.
- Missing tax inputs block a complete-result claim.
- Unknown adjustments are not converted to zero.
- A Section 7 worksheet is not represented as a complete DPFO return.
- Draft statements cannot be mistaken for approved statutory financial statements.

## Milestone 6: Workspace, settings, and canonical configuration

Target: PR 6.

### TODO

- [ ] Make organization and workspace pages consume the same canonical obligation service.
- [ ] Make conditionality, evidence, completeness, and configuration gaps visible on both surfaces.
- [ ] Rename `All obligations` when the result excludes annual or unsupported obligations, or include those obligations before retaining the label.
- [ ] Remove duplicate effective-row and date-resolution utilities left in web loaders.
- [ ] Move supported legal rates, thresholds, and deadline rules into effective-dated canonical configuration.
- [ ] Include primary-source identity, verification date, and effective interval in legal configuration.
- [ ] Render number-series explanatory text from `DEFAULT_NUMBER_SERIES` instead of repeating codes.
- [ ] Enforce responsible-assignee workspace membership through a durable database invariant or safe automatic unassignment when membership becomes inactive.
- [ ] Preserve existing shadcn/ui and Tailwind design tokens.
- [ ] Add accessible UI states for `needs input`, `unsupported`, incomplete, and condition-not-evaluated results.
- [ ] Add integration tests for tenant isolation, inactive memberships, archived organizations, mixed fiscal periods, unknown profiles, annual-scope labels, and organization/workspace agreement.

### Acceptance criteria

- Organization and workspace views cannot disagree for the same organization and date.
- No page claims complete obligation coverage while omitting known categories.
- Assignment integrity survives membership deactivation or removal.
- Legal constants have one effective-dated source of truth.
- Number-series UI text follows the canonical defaults automatically.
- No new hardcoded color, brand, rate, threshold, deadline, or series-code value is introduced outside its canonical layer.

## Milestone 7: Verification, CI, and delivery

Applies to every remediation PR and to the fully integrated stack.

### TODO

- [x] Review the diff against the PR's declared scope and dependency.
- [x] Run affected unit and integration tests during implementation.
- [x] Run accounting, database, API, and web typechecks.
- [x] Run lint, formatting, architectural-boundary checks, and repository validation.
- [x] Run database migration, FORCE RLS, and tenant-isolation tests.
- [x] Run the full repository test suite before marking the PR ready.
- [x] Run the production build before marking the final integration PR ready.
- [x] Perform a security review covering authorization, RLS, SQL parameterization, stored legal evidence, and cross-tenant behavior.
- [x] Perform a thermo structural review for duplicated policy, unsafe casts, excessive branching, misleading types, and unnecessary complexity.
- [x] Verify changed Closing, Settings, Payroll, VAT, Income Tax, Statements, and Workspace behavior through web component and server-loader tests.
- [x] Confirm that the corrective data-flow changes do not introduce material layout changes requiring new screenshots.
- [x] Use Conventional Commits and keep commits logically reviewable.
- [x] Push every branch and open a PR with rationale, official sources, migration notes, test evidence, and dependency information.
- [x] Monitor GitHub Actions and fix failures until every required check is green.
- [x] Rebase or update stacked branches when upstream remediation changes invalidate later checks.
- [x] Mark each PR ready for review only after local and remote verification pass.
- [x] Document the final merge order and any required deployment sequencing.
- [x] Leave every PR unmerged.

### Required PR evidence

Each PR description must include:

- the confirmed defect or structural risk it resolves;
- the canonical domain rule introduced or changed;
- primary legal sources and verification dates for statutory behavior;
- migration and legacy-data behavior;
- security and tenant-isolation impact;
- tests added and exact local commands run;
- GitHub Actions status;
- screenshots for material UI changes;
- stack dependency and intended merge order;
- an explicit `Do not merge automatically` note.

### Acceptance criteria

- Every PR passes all required GitHub Actions checks.
- The final integrated stack passes full typecheck, test, lint, boundary, migration, security, and production-build verification.
- Reviewers can reproduce every important legal rule through a focused test.
- Every migration is forward-safe, tenant-isolated, and documented.
- Every PR is ready for review and none is merged.

## Definition of done

- [x] Every confirmed P1 and in-scope P2 finding is fixed or explicitly represented as unsupported with a safe user-visible state.
- [x] Accounting periods and statutory filing periods are no longer conflated.
- [x] Czech legal dates no longer depend on UTC conversion or database session timezone.
- [x] Effective-dated VAT and payroll facts are evaluated only in their valid intervals.
- [x] Schedule candidates, actual obligations, filing records, and UI status are distinct concepts.
- [x] No unknown accounting or tax fact silently becomes zero, `false`, nonpayer, filed, or overdue.
- [x] No partial worksheet is labelled as a complete statutory return or approved financial statement.
- [x] DAP, KH, and SH share canonical transaction classifications and reconcile where legally required.
- [x] Payroll obligations follow monthly participation and withholding evidence.
- [x] DPPO rates and supported legal rules are historically effective and taxpayer-category aware.
- [x] Organization and workspace surfaces agree and expose the same completeness limitations.
- [x] All migrations preserve data, FORCE RLS, and tenant isolation.
- [x] All local verification and required remote CI checks are green.
- [x] The seven-PR stack is documented, pushed, and ready to merge in order.
- [x] No remediation PR has been merged.

## Explicit non-goals

- Automatic filing, signing, or submission to Czech authorities.
- Full EPO/XML support for every tax and statutory form.
- Fabricating missing historical receipt dates, employment participation, tax adjustments, or filing confirmations.
- Replacing qualified Czech tax-advisor review for unsupported or ambiguous statutory cases.
- Refactoring unrelated accounting, workspace, or design-system code.
