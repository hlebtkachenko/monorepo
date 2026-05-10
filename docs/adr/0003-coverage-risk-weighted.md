# 3. Test coverage: risk-weighted, not flat percentage

- Status: Accepted
- Date: 2026-05-10
- Deciders: Hleb Tkachenko

## Context and Problem Statement

A flat coverage gate (e.g. 80%) is a goodhart magnet: contributors write trivial tests on cold paths to clear the bar, money paths stay under-tested, and the metric flatters mediocre work. Need a coverage policy that maps to risk.

## Decision Drivers

- Money / auth / migration paths must be near-bulletproof.
- UI shells are visually testable and rarely the source of incidents — over-testing them is theater.
- Mutation testing catches the tests that exist but don't actually constrain behavior.
- Solo dev: bar must be enforceable without a coverage czar.

## Considered Options

1. **Flat 80% line coverage on the whole repo.** Easy to enforce, trivially gameable.
2. **Risk-weighted bands per directory.** Higher bar on hot paths, lower (or none) on shells. Mutation testing on the hot paths.
3. **No coverage gate, mutation-only.** Strong signal but slow; CI overhead grows with the repo.

## Decision Outcome

Chosen: **Option 2, Risk-weighted bands plus mutation on hot paths.**

Bands:
| Path | Line + branch coverage | Mutation testing |
|------|------------------------|------------------|
| Money paths (payments, ledger, reconciliation) | >= 95% | Stryker nightly |
| Auth, RBAC, migrations | >= 90% | Stryker nightly |
| Domain logic (non-money) | >= 80% | Spot-check |
| API handlers, validators | >= 80% | Spot-check |
| UI shells (`apps/web/app/**` non-route logic) | >= 70% | None |
| Stories, fixtures, scaffolding | excluded | None |

Mutation testing: Stryker runs nightly via a scheduled workflow, not in the PR path. PR cycle gets the coverage band; mutation result is a tracking signal.

No flat repo-level percentage. PRs that lower a band's coverage fail. PRs that raise a band's coverage pass.

## Consequences

Positive:
- Coverage metric mirrors actual risk.
- Mutation testing catches assertion-free tests that pad the band.
- UI changes don't require theatrical tests.

Negative:
- More config than a single threshold.
- Bands have to be revisited when new high-risk packages land (auth, payments). This ADR or a follow-up captures each addition.

## Validation

- Coverage config in `vitest.config.ts` enforces per-directory thresholds (added when each high-risk package lands).
- Stryker config under `stryker.conf.json` (added with the first money path).

## References

- `docs/conventions/CI-POLICY.md`
- `docs/plans/CICD-PLAN.md`
