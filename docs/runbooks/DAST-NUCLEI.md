# DAST — Nuclei scan

> Public host + email inventory: [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md).
> Linear: DEV-47.

`.github/workflows/nuclei-dast.yml` runs [ProjectDiscovery Nuclei](https://projectdiscovery.io)
nightly against the live afframe hosts. It is the one layer the source-level
scanners (CodeQL, OSV, Trivy, Dependabot, gitleaks, TruffleHog) cannot reach:
**DAST** — testing the running, deployed system over the network, the way an
attacker sees it. Findings surface in the GitHub **Security tab** as SARIF under
category `nuclei`.

**Advisory only.** The scan never fails on findings. Flip it to a required check
manually only after a green cycle (see "Promotion" below).

## What it scans

Both environments, but **only hosts that are actually serving**:

| Host                        | Env     | Notes                         |
| --------------------------- | ------- | ----------------------------- |
| `app.afframe.com`           | prod    | normally 24/7                 |
| `api.afframe.com`           | prod    | public API + Scalar reference |
| `admin.afframe.com`         | prod    | admin surface                 |
| `app-staging.afframe.com`   | staging | parked most of the week       |
| `api-staging.afframe.com`   | staging | parked most of the week       |
| `admin-staging.afframe.com` | staging | parked most of the week       |

Prod is the primary target (always-on, customer-facing, untrusted). Staging is
scanned opportunistically — caught automatically on the days it is up.

Template classes that matter for an unauthenticated baseline: missing/weak
security headers, TLS misconfiguration, exposed `.env`/backup files, leaked
stack traces, fingerprinted-CVE versions on the public surface.

## How a run works

```
probe 6 hosts ─▶ build targets.txt (reachable only)
              ─▶ nuclei scan (safe profile, rate-limited)   [skipped if 0 reachable]
              ─▶ ensure valid SARIF ─▶ upload to Security tab
```

No infra mutation: the job never resumes/parks an env, touches AWS, or calls the
Cloudflare API. It sends HTTP only to whatever is already up.

### Reachability probe (why nothing false-fails)

Each host is probed with one `curl`; it is scanned **only** when it returns a
normal `2xx/3xx/401/403`. Everything else is **skipped, not failed**:

| Response        | Meaning                               | Action |
| --------------- | ------------------------------------- | ------ |
| 2xx/3xx/401/403 | app serving (incl. auth-gated)        | scan   |
| 503             | staging sleeping page, or maintenance | skip   |
| other 5xx       | origin error / down                   | skip   |
| 000             | unreachable / DNS / timeout           | skip   |

So a parked staging or a prod maintenance window yields a clean green run with
those hosts logged as skipped. If **zero** hosts are reachable, the scan step is
skipped entirely and an empty (valid) SARIF is uploaded — still green.

The sleeping page is the Cloudflare Worker in `infra/cloudflare-sleeping/`, which
answers **HTTP 503** for every request while an env is parked — hence the 5xx
skip rule catches it without any Cloudflare API call.

### Safety against live production (Mode A)

The scan hits real customers, so it runs an **active-but-safe** profile:

- `-exclude-tags intrusive,dos,fuzzing,fuzz,brute-force` — no fuzzing, DoS, or
  destructive payloads. Detection-style checks only.
- `-rate-limit 10` (req/s) — Cloudflare rate rules don't trip; the origin isn't
  stressed.
- `-severity critical,high,medium` — cuts noise and request volume.

This is standard practice for scanning your own property. It is **not zero-risk**
(any request to prod carries some), but the excluded tags remove the dangerous
classes. To go fully passive instead, drop `-severity ... ` to safe categories
only; to widen coverage, see phase 2.

## Operate

```
gh workflow run nuclei-dast.yml          # manual run any time (probes, scans what's up)
gh run watch                             # follow the latest run
```

Read findings: GitHub repo → **Security** → **Code scanning** → filter category
`nuclei`. Each finding carries the host URL, so prod vs staging is visible per
result. Dismiss false positives there as usual.

## Coverage limits + phase 2

v1 is an **unauthenticated edge baseline**. Two deliberate gaps:

1. **Cloudflare bot-protection** will challenge/JS-gate an unauthenticated Nuclei
   run, so deep probes mostly see the edge. To let Nuclei reach the origin: add a
   Cloudflare **WAF skip rule** matching a secret header, store it as repo secret
   `NUCLEI_SCAN_TOKEN`, and pass `-H "X-Scan-Token: <token>"` in the scan `args`
   (mask the token in a prior step; do not put it in a step _output_).
2. **Auth-gated app/admin logic** is invisible to an unauthenticated scan.
   Authenticated scanning must use a **seeded throwaway tenant** (never real org
   data — multi-tenant RLS pollution risk) with session headers passed to Nuclei.
   This is also where active scanning must stay OFF prod and ON staging only.

## Dependency tracking

`projectdiscovery/nuclei-action` is a GitHub Action → covered by Dependabot's
`github-actions` ecosystem (`.github/dependabot.yml`). No custom update-check
workflow needed. The Nuclei binary is pinned to `version: latest` deliberately:
a security scanner should run the newest engine + templates each night.

## Promotion to required (manual, Hleb)

After a green nightly cycle, add `Nuclei DAST / scan` to the required checks in
`.github/rulesets/main.json`. Advisory until then — the scan's job is visibility,
not gating merges, while it beds in behind Cloudflare.
