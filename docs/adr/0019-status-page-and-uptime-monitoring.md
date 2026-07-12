# 19. Status page and uptime monitoring — OpenStatus self-hosted on the OVH VPS

> **Updated**: Live host inventory is in [`docs/DOMAINS-AND-EMAIL.md`](../DOMAINS-AND-EMAIL.md). This ADR is the decision record.

- Status: Accepted
- Date: 2026-05-17
- Deciders: Hleb Tkachenko

## Context and Problem Statement

`docs/runbooks/INCIDENT.md`, `DEPLOY.md`, and `DR-DRILL.md` already assume a status page and
external synthetic monitoring exist — "Status page updated within 15 minutes for SEV1/2",
"Synthetic checks green for the last 24h", incident message templates. None of it is
implemented. The only monitoring today is CloudWatch infra alarms, which run _inside_ AWS
and cannot see the customer-facing path. A public status page plus external uptime
monitoring is required before production launch.

Two coupled questions: which tool, and where to host it. The hosting question is the
load-bearing one — a status page exists to talk to customers _during an outage_, so it must
not share a failure domain with the system it reports on.

## Decision

Adopt **OpenStatus** (OSS, AGPL-3.0 — monitoring and status page in one tool, stack matches
the repo), **self-hosted via Docker Compose on the OVH VPS** (WSL2 Ubuntu, the same pattern
as Verdaccio / turbo-cache / the gh-runner), fronted by a **Cloudflare Tunnel** — no public
VPS ports, Cloudflare terminates TLS, reusing the [ADR-0008](0008-cloudflare-tunnel-and-email.md)
front-door pattern. The page is published at `status.afframe.com`. Monitors are
version-controlled as code in `infra/openstatus/openstatus.yaml` and synced with the
OpenStatus CLI. The status page is hosted **off AWS, on a different provider from the app it
monitors** — this is the decision, not an incidental detail.

## Consequences

Positive:

- Independent failure domain — an AWS `eu-central-1` outage takes the app down but leaves
  the status page up, so customers still get incident communication.
- True external vantage — an OVH probe reaching `app.afframe.com` over the public internet
  exercises Cloudflare, the tunnel, DNS, and the edge; an in-AWS probe sees none of that.
- Zero AWS surface — no new Fargate service, no CDK change, no AWS budget impact, and
  immunity to the [ADR-0016](0016-cost-runaway-protection.md) cost kill-switch.
- One OSS tool covers both uptime monitoring and the public page; its stack
  (Next.js / Hono / Drizzle / shadcn) matches the monorepo.
- Monitors are PR-reviewable config, consistent with the repo's config-in-git culture.
- Free — runs on the existing VPS.

Negative / trade-offs:

- Self-host gives only a single private-location probe (one European vantage), not
  OpenStatus Cloud's multi-region fan-out. Adequate for MVP; more regions later = more
  probe containers.
- Cloudflare (DNS + tunnel) now fronts both the app and the status page, so a _global_
  Cloudflare outage takes down both. Unavoidable — the `afframe.com` DNS zone is on
  Cloudflare regardless — and the realistic outage (an AWS region down) is fully covered.
- The status page source lives in the monorepo but is **not** deployed by any AWS/CDK
  pipeline — a split that operators and agents must understand (see See also).
- OpenStatus self-host quirks: workspace feature limits are set via raw SQL (no plan UI),
  Tinybird needs `tb --local deploy`, and `apps/admin` plus localhost-only sidecars are not
  externally monitorable.

Follow-up work required:

- Live deployment on the VPS per `docs/runbooks/STATUS-PAGE.md` (AFF-89 Phases 1-3) — an
  operational step, not part of the repo change that lands this ADR.
- Optional CI job to run `openstatus monitors apply` on merge — deferred.
- Extend `/api/health` to report sidecar health transitively so OpenFGA / Cerbos / pgBouncer
  become observable through the API monitor — separate issue.

## Alternatives considered

- **In-AWS hosting (Fargate, same region)** — rejected. A status page on the infrastructure
  it monitors dies with that infrastructure; an in-AWS probe sees the AWS-internal network,
  not the customer path; it counts against the AWS budget and is collateral to the ADR-0016
  kill-switch.
- **Atlassian Statuspage** — rejected. Free tier has no custom domain and does no
  monitoring; the Atlassian startup account adds nothing here.
- **Better Stack** — rejected. Proprietary and cloud-only, which violates the OSS /
  self-host requirement; free-tier limits are unusable.
- **OpenStatus Cloud (free tier)** — a viable off-AWS fallback (same product, no lock-in,
  migratable to self-host later) if the WSL2 setup proves too costly. Not chosen because
  self-hosting keeps data and control on owned infrastructure.

This does not reopen [ADR-0004](0004-no-self-hosted-runners.md). That ADR rejected the OVH
VPS for _CI runners_ — untrusted PR code, ephemeral-runner discipline. A status page is
first-party, runs no untrusted code, and must be off the monitored infrastructure: a
different problem with a different answer.

## See also

- [ADR-0008](0008-cloudflare-tunnel-and-email.md) — Cloudflare Tunnel front door (pattern reused)
- [ADR-0016](0016-cost-runaway-protection.md) — cost kill-switch the off-AWS placement is immune to
- [ADR-0004](0004-no-self-hosted-runners.md) — no self-hosted CI runners (distinct decision)
- `infra/openstatus/` — monitors-as-code (code anchor)
- `docs/runbooks/STATUS-PAGE.md` — deploy + day-2 operations
- `docs/runbooks/INCIDENT.md`, `docs/runbooks/DEPLOY.md` — runbooks that consume the status page
