# infra/openstatus

**Deployed on the OVH VPS (WSL2 Ubuntu, Docker Compose) and fronted by Cloudflare Tunnel.
NOT an AWS / CDK target — `cdk deploy`, `make deploy-cdk`, and `_deploy-aws.yml` never
touch this directory.** It holds only monitors-as-code. The OpenStatus app itself runs
from the upstream `openstatusHQ/openstatus` Docker Compose stack on the VPS — its compose
file and image versions are managed there, not in this repo.

A status page must not run on the infrastructure it monitors: if it did, an AWS region
outage would take down the app and the page that reports it together. OpenStatus on OVH is
an independent failure domain and a true external vantage point. Full rationale:
[ADR-0019](../../docs/adr/0019-status-page-and-uptime-monitoring.md). Operational procedure:
[`docs/runbooks/STATUS-PAGE.md`](../../docs/runbooks/STATUS-PAGE.md).

## What is in this directory

| File              | Role                                                                                                                                                |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `openstatus.yaml` | Monitors-as-code: the 7 uptime monitors (4 public, 3 private staging), version-controlled and PR-reviewable. Source-of-truth for what's configured. |
| `README.md`       | This file.                                                                                                                                          |

## How monitors map to OpenStatus

**The upstream `openstatus` CLI does not target self-host** — `internal/api/client.go`
hardcodes `https://api.openstatus.dev/v1` with no env override. On self-host, monitors are
created via the dashboard UI. This YAML is therefore **operator-authored intent / record
of what was configured**, not a file consumed by any tool. PRs to this file map 1:1 to
dashboard changes that an operator applies manually.

If the upstream CLI gains self-host support (or a fork ships), the file already follows
the documented YAML schema (`# yaml-language-server: $schema=https://www.openstatus.dev/schema.json`)
and could be applied as-is — `regions` slug + the `dns` assertion shape would need a
`--dry-run` reconciliation against the live instance.

## Monitors

| Key             | Target                                 | Check                                           | Public page?                         | Active?                       |
| --------------- | -------------------------------------- | ----------------------------------------------- | ------------------------------------ | ----------------------------- |
| `web-app-prod`  | `app.afframe.com/api/version`          | HTTP 200                                        | ✅ Public — group "Web App"          | ❌ paused (prod not deployed) |
| `api-prod`      | `api.afframe.com/api/health`           | HTTP 200, body contains `"status":"ok"`         | ✅ Public — group "API"              | ❌ paused                     |
| `admin-prod`    | `admin.afframe.com/api/health`         | HTTP 200, body contains `"ok":true`             | ✅ Public — group "Admin"            | ❌ paused                     |
| `dns-afframe`   | `afframe.com` apex (A record)          | A `Not Equal` `0.0.0.0` (effectively non-empty) | ✅ Public                            | ✅                            |
| `staging-web`   | `app-staging.afframe.com/api/version`  | HTTP 200                                        | ❌ Private — dashboard + alerts only | ✅                            |
| `staging-api`   | `api-staging.afframe.com/api/health`   | HTTP 200, body contains `"status":"ok"`         | ❌ Private                           | ✅                            |
| `staging-admin` | `admin-staging.afframe.com/api/health` | HTTP 200, body contains `"ok":true`             | ❌ Private                           | ✅                            |

Production monitors are **paused** until production deploys to `app.afframe.com` /
`api.afframe.com` / `admin.afframe.com`. Activating them before deploy would show "DOWN"
on the public page. Flip them to active after the first production deploy.

## Public status page composition

The public page at `status.afframe.com` attaches the four public monitors, grouped
"Web App" / "API" / "Admin" (+ DNS ungrouped). Staging monitors stay off the public page.
The page itself is configured in the OpenStatus dashboard — OpenStatus has no config-as-code
for status pages; see `STATUS-PAGE.md`.

## Adding a monitor

1. Add a new top-level key to `openstatus.yaml` matching the existing schema.
2. Create the same monitor in the dashboard UI (Private Location: `OVH EU`).
3. Attach to the public page in the dashboard if it should be public.
4. Commit the YAML change as a normal PR.

## Not a versioned dependency

`openstatus.yaml` pins no image tag and no version. The OpenStatus app version lives on
the VPS, not in this repo. So `infra/openstatus/` adds no versioned dependency and needs
no Dependabot entry or update-check workflow under the AGENTS.md "Dependency Update
Coverage Rule" — this is intentional, not a gap.

## See also

- [ADR-0019](../../docs/adr/0019-status-page-and-uptime-monitoring.md) — why OpenStatus, why off-AWS
- [`docs/runbooks/STATUS-PAGE.md`](../../docs/runbooks/STATUS-PAGE.md) — deploy + day-2 operations (+ all the self-host workarounds)
- [ADR-0008](../../docs/adr/0008-cloudflare-tunnel-and-email.md) — the Cloudflare Tunnel pattern this reuses
