# 4. CI runners: GitHub-hosted only, no self-hosted

- Status: Accepted
- Date: 2026-05-10
- Deciders: Hleb Tkachenko

## Context and Problem Statement

GitHub Actions offers self-hosted runners. The temptation is real: a $7/month VPS could absorb minute overage on private repos. The temptation is wrong for this repo.

## Decision Drivers

- This repo is currently public; will become private when proprietary code lands.
- Self-hosted runners on public repos accept arbitrary fork-PR code execution on infrastructure the maintainer owns. Hard NO from a security posture.
- GitHub-hosted ARM runners are now generally available, free for public repos, billed at standard rates for private.
- Solo dev minutes burn is bounded; no current concrete signal of overage pain.

## Considered Options

1. **GitHub-hosted only, all repos.** Default. Simple. Public-repo safe.
2. **Self-hosted on OVH VPS.** Cheaper at scale but requires ephemeral runner discipline + repo-level isolation; security cost dominates for this repo.
3. **Hybrid: GitHub-hosted for PR builds, self-hosted for main / nightly only.** Closes the public-PR risk but adds operational complexity for a benefit that is currently theoretical.

## Decision Outcome

Chosen: **Option 1, GitHub-hosted only.**

Hard rule: never self-hosted on public repos.

Self-hosted is revisited if and only if private-repo minutes overage exceeds $300/month for three consecutive months, with workload analysis demonstrating that the overage is structural (not a one-off CI bug).

Public-repo self-hosted runners: hard NO, no exception.

## Consequences

Positive:
- Zero infra to maintain.
- Public-repo PRs from forks cannot run on owned infrastructure.
- ARM runners give Graviton-parity dev experience for free.

Negative:
- Hits private-repo minutes cap when the repo turns private and grows.
- No path to bring expensive runners (large RAM, GPU) without revisiting.

## Migration Path

If overage trigger fires:
1. Re-evaluate Option 3 (hybrid).
2. If self-hosted lands, it lives on OVH VPS via WSL2 Ubuntu, ephemeral runners, repo-scoped only, never on public repos.
3. Companion infra (Verdaccio, Turborepo Remote Cache) gates on the same trigger.

This ADR is replaced (not extended) when that happens.

## References

- `docs/conventions/CI-POLICY.md`
- `docs/plans/CICD-PLAN.md`
