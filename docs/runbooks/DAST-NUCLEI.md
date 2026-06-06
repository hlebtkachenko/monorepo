# DAST — Nuclei scan against staging

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md).
> Env power model: [`docs/runbooks/ENV-POWER.md`](ENV-POWER.md). Linear: DEV-47.

`.github/workflows/nuclei-dast.yml` runs [ProjectDiscovery Nuclei](https://projectdiscovery.io)
nightly against the three live **staging** hosts. It is the one layer the
source-level scanners (CodeQL, OSV, Trivy, Dependabot, gitleaks, TruffleHog)
cannot reach: **DAST** — testing the running, deployed system over the network,
the way an attacker sees it. Findings surface in the GitHub **Security tab** as
SARIF under category `nuclei`.

**Advisory only.** The scan never fails on findings and never touches
production. Flip it to a required check manually only after a green cycle
(see "Promotion" below).

## What it scans

| Host                        | Surface (unauthenticated, v1) |
| --------------------------- | ----------------------------- |
| `app-staging.afframe.com`   | web app public/edge surface   |
| `api-staging.afframe.com`   | public API + Scalar reference |
| `admin-staging.afframe.com` | admin login surface           |

Template classes that matter for an unauthenticated baseline: missing/weak
security headers, TLS misconfiguration, exposed `.env`/backup files, leaked
stack traces, fingerprinted-CVE versions on the public surface.

## How a run works

Staging is normally **cold-paused** (`power.yml`). A naive scan would hit the
Cloudflare "asleep" Worker, not the app. So the job, in one runner with a
continuous OIDC session:

```
capture pre-state ─▶ resume (RDS start + ECS desired=1 + wait stable)
                  ─▶ unbind sleeping Worker (routes.sh off staging)
                  ─▶ ready gate (assert no staging sleeping routes bound)
                  ─▶ nuclei scan (3 hosts, severity ≥ medium, rate-limited)
                  ─▶ ensure valid SARIF ─▶ upload to Security tab
                  ─▶ restore: re-park unless it was already up
```

### Cost-safety design (read before editing)

- **Restore is `if: always() && state != 'up'`** — it re-parks on `cold`/`warm`
  _and on any uncertainty_ (a crashed pre-state step leaves `state` empty). Only
  a staging that was _positively in use_ beforehand is left up; a manual
  warm-pause is restored to warm, everything else to cold. This
  fail-safe-toward-parking default means a crash cannot leak RDS/Fargate cost.
- **The re-park is fail-visible, not best-effort.** The restore step attempts
  every cost call (Fargate→0, tag, RDS stop, sleeping page on) and exits RED if
  any fails — an incomplete re-park surfaces as a failed run, never a silent
  green. Fresh OIDC credentials are re-assumed just before restore so a long
  scan cannot expire the session out from under the re-park.
- **Timeouts live on the long steps, not (only) the job.** A _job_ timeout
  terminates the runner and skips the `if: always()` restore step → cost leak.
  The resume (30m) and scan (30m) steps carry their own `timeout-minutes`; the
  90m job timeout is a backstop that must never be the thing that fires.
- **`concurrency: power-staging`** shares power.yml's repo-wide group, so a scan
  and any manual `power.yml` op on staging serialize instead of racing the same
  ECS service / RDS instance. A manual power run **queues behind** a running
  nightly scan — intentional, not a hang.

### Known race (accepted)

The autostop Lambda (`infra/cdk/lib/security-stack.ts`, `MAX_UPTIME_HOURS=5`)
cold-pauses staging on a 30-min schedule once uptime exceeds 5h. Concurrency
groups do **not** serialize against an EventBridge rule. This only bites when
staging was _already up >5h_ when the nightly starts: the Lambda may park it
mid-scan (partial results). The scan resumes uptime from a cold start in the
normal case, so it stays well inside the 5h window. End state is always safe
(either we re-park, or the Lambda does, and restore skips a positively-in-use
env). No action needed; documented so a future reader doesn't chase a "flaky"
scan.

## Operate

```
gh workflow run nuclei-dast.yml          # manual run (any time; resumes + re-parks staging)
gh run watch                             # follow the latest run
```

Read findings: GitHub repo → **Security** → **Code scanning** → filter tool
`nuclei` / category `nuclei`. Dismiss false positives there as usual.

## Coverage limits + phase 2

v1 is an **unauthenticated edge baseline**. Two deliberate gaps:

1. **Cloudflare bot-protection** will challenge/JS-gate an unauthenticated
   Nuclei run, so deep probes mostly see the edge. To let Nuclei reach the
   origin: add a Cloudflare **WAF skip rule** matching a secret header, store
   it as repo secret `NUCLEI_SCAN_TOKEN`, and pass `-H "X-Scan-Token: <token>"`
   in the scan `args` (mask the token in a prior step; do not put it in a step
   _output_). Deferred to keep v1 surface small.
2. **Auth-gated app/admin logic** is invisible to an unauthenticated scan.
   Authenticated scanning must use a **seeded throwaway tenant** (never real org
   data — multi-tenant RLS pollution risk) with session headers passed to
   Nuclei. Separate phase-2 issue.

## Dependency tracking

`projectdiscovery/nuclei-action` is a GitHub Action → covered by Dependabot's
`github-actions` ecosystem (`.github/dependabot.yml`). No custom update-check
workflow needed. The Nuclei binary is pinned to `version: latest` deliberately:
a security scanner should run the newest engine + templates each night.

## Promotion to required (manual, Hleb)

After a green nightly cycle, add `Nuclei DAST (staging) / scan` to the required
checks in `.github/rulesets/main.json`. Advisory until then — the scan's job is
visibility, not gating merges, while it beds in behind Cloudflare.
