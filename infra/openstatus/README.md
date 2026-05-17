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

| File              | Role                                                                                                                                                   |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `openstatus.yaml` | Monitors-as-code: the 5 uptime monitors (3 public, 2 private), version-controlled and PR-reviewable. Single source of truth for monitor configuration. |
| `README.md`       | This file.                                                                                                                                             |

## How monitors map to OpenStatus

`openstatus.yaml` is the OpenStatus CLI's monitoring-as-code format — each top-level key is
one monitor. The CLI diffs the file against the live workspace and applies the delta:

```bash
# From the VPS, with OPENSTATUS_API_TOKEN exported (see STATUS-PAGE.md):
openstatus monitors apply -c infra/openstatus/openstatus.yaml --dry-run   # preview
openstatus monitors apply -c infra/openstatus/openstatus.yaml             # apply
```

The file is operator-authored intent. Environment-bound values — the private-location
`regions` slug, and the `dns` monitor's request/assertion shape — are reconciled with
`--dry-run` against the live self-hosted instance before applying; no tool validates this
file at PR time.

## Monitors

| Monitor (key)  | Target                            | Check                                   | Public page?                         |
| -------------- | --------------------------------- | --------------------------------------- | ------------------------------------ |
| `web-app-prod` | `app.afframe.com/api/version`     | HTTP 200                                | ✅ Public — group "Web App"          |
| `api-prod`     | `app.afframe.com/api/health`      | HTTP 200, body contains `"status":"ok"` | ✅ Public — group "API"              |
| `dns-afframe`  | `afframe.com` apex                | DNS A record present                    | ✅ Public                            |
| `staging-web`  | `staging.afframe.com/api/version` | HTTP 200                                | ❌ Private — dashboard + alerts only |
| `staging-api`  | `staging.afframe.com/api/health`  | HTTP 200                                | ❌ Private — dashboard + alerts only |

## Public status page composition

The public page at `status.afframe.com` attaches the three production monitors only,
grouped "Web App" and "API". Staging monitors stay off the public page. The page itself
is configured in the OpenStatus dashboard — OpenStatus has no config-as-code for status
pages yet, so page layout is not tracked here; see `STATUS-PAGE.md`.

## Adding a monitor

1. Add a new top-level key to `openstatus.yaml` in the schema above.
2. `openstatus monitors apply -c infra/openstatus/openstatus.yaml --dry-run` on the VPS.
3. Apply, then attach to the public page in the dashboard if it should be public.
4. Commit the YAML change as a normal PR.

## Not a versioned dependency

`openstatus.yaml` pins no image tag and no version. The OpenStatus app version lives on
the VPS, not in this repo. So `infra/openstatus/` adds no versioned dependency and needs
no Dependabot entry or update-check workflow under the CLAUDE.md "Dependency Update
Coverage Rule" — this is intentional, not a gap.

## See also

- [ADR-0019](../../docs/adr/0019-status-page-and-uptime-monitoring.md) — why OpenStatus, why off-AWS
- [`docs/runbooks/STATUS-PAGE.md`](../../docs/runbooks/STATUS-PAGE.md) — deploy + day-2 operations
- [ADR-0008](../../docs/adr/0008-cloudflare-tunnel-and-email.md) — the Cloudflare Tunnel pattern this reuses
