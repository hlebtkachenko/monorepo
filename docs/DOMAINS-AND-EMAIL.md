# Domains and Email

Inventory of `*.afframe.com` hosts and `@afframe.com` addresses, mapped to
the ADRs and config files that own each one. This file deliberately omits
operational identifiers (tunnel names, bucket names, secret-store
references) — agents working on the repo find those in the linked config
files; the public inventory carries only what is already discoverable via
DNS or in committed config.

For decisions see [ADR-0008](adr/0008-cloudflare-tunnel-and-email.md). For
operational procedures see the runbook linked under each entry.

Each entry is a self-contained stanza headed by `### <host>`.

---

## Index

Hosts:

- `afframe.com` — zone apex
- `app.afframe.com` — web (prod)
- `app-staging.afframe.com` — web (staging)
- `api.afframe.com` — public API (prod)
- `api-staging.afframe.com` — public API (staging)
- `admin.afframe.com` — admin (prod)
- `admin-staging.afframe.com` — admin (staging)
- `status.afframe.com` — public status page
- `monitoring.afframe.com` — internal monitoring dashboard
- `cache.afframe.com` — Turborepo remote cache
- `docs.afframe.com` — planned, not live ([AFF-88](https://linear.app/hapddev/issue/AFF-88))

Email:

- `*@afframe.com` — inbound
- `no-reply@app.afframe.com` — outbound, web (prod)
- `no-reply@app-staging.afframe.com` — outbound, web (staging)
- `notifications@afframe.com` — outbound, status alerts

---

## Hostnames

### afframe.com

- Role: zone apex; foundation for all `*.afframe.com` records and email
- DNS: Cloudflare
- Source of truth: Cloudflare dashboard

### app.afframe.com

- Role: web app (production)
- Served by: AWS Fargate, `web` container
- Behind: Cloudflare Tunnel
- Source-of-URL var: `vars.APP_DOMAIN_PRODUCTION`
- ADR: [0008](adr/0008-cloudflare-tunnel-and-email.md)
- Runbook: [AWS-DEPLOY.md](runbooks/AWS-DEPLOY.md)

### app-staging.afframe.com

- Role: web app (staging)
- Served by: AWS Fargate, `web` container
- Behind: Cloudflare Tunnel
- Source-of-URL var: `vars.APP_DOMAIN_STAGING`
- ADR: [0008](adr/0008-cloudflare-tunnel-and-email.md)
- Runbook: [AWS-DEPLOY.md](runbooks/AWS-DEPLOY.md)

### api.afframe.com

- Role: public REST API (production)
- Served by: AWS Fargate, `api` container
- Behind: Cloudflare Tunnel
- Source-of-URL: tunnel route only (no env var; OpenAPI server URL in `apps/api/`)
- Auth: API keys
- ADR: [0008](adr/0008-cloudflare-tunnel-and-email.md), [0020](adr/0020-public-api-foundation.md)

### api-staging.afframe.com

- Role: public REST API (staging)
- Served by: AWS Fargate, `api` container
- Behind: Cloudflare Tunnel
- Source-of-URL: tunnel route only
- ADR: [0008](adr/0008-cloudflare-tunnel-and-email.md), [0020](adr/0020-public-api-foundation.md)

### admin.afframe.com

- Role: staff admin surface (production)
- Served by: AWS Fargate, `admin` container
- Behind: Cloudflare Tunnel
- Source-of-URL var: `vars.ADMIN_DOMAIN_PRODUCTION`
- Cookies: host-scoped (independent of `app.afframe.com`)
- Gating: in-app `ADMIN_WORKSPACE_ALLOWLIST` (no Cloudflare Access)
- ADR: [0008 amendment](adr/0008-cloudflare-tunnel-and-email.md)

### admin-staging.afframe.com

- Role: staff admin surface (staging)
- Served by: AWS Fargate, `admin` container
- Behind: Cloudflare Tunnel
- Source-of-URL var: `vars.ADMIN_DOMAIN_STAGING`
- Gating: in-app `ADMIN_WORKSPACE_ALLOWLIST`
- ADR: [0008 amendment](adr/0008-cloudflare-tunnel-and-email.md)

### status.afframe.com

- Role: public status page
- Served by: OVH VPS (off AWS by design; independent failure domain)
- Behind: Cloudflare Tunnel
- ADR: [0019](adr/0019-status-page-and-uptime-monitoring.md)
- Runbook: [STATUS-PAGE.md](runbooks/STATUS-PAGE.md)

### monitoring.afframe.com

- Role: internal monitoring dashboard (staff only)
- Served by: OVH VPS
- Behind: Cloudflare Tunnel
- Auth: staff login
- ADR: [0019](adr/0019-status-page-and-uptime-monitoring.md)
- Runbook: [STATUS-PAGE.md](runbooks/STATUS-PAGE.md)

### cache.afframe.com

- Role: Turborepo remote cache (CI build artifacts)
- Served by: Cloudflare Worker
- Source-of-URL var: `vars.TURBO_API`
- Auth: bearer token
- ADR: [0021](adr/0021-turborepo-remote-cache-cloudflare.md)
- Runbook: [CI-TURBO-REMOTE-CACHE.md](runbooks/CI-TURBO-REMOTE-CACHE.md)
- Config: `infra/cloudflare/wrangler.jsonc`

### docs.afframe.com (planned)

- Status: not yet live
- DNS: not provisioned
- Tracking: [AFF-88](https://linear.app/hapddev/issue/AFF-88)

---

## Email

### `*@afframe.com` (inbound)

- Provider: Cloudflare Email Routing
- Routing: catch-all + specific rules configured in Cloudflare dashboard
- ADR: [0008](adr/0008-cloudflare-tunnel-and-email.md) → Email layer

### `no-reply@app.afframe.com` (outbound)

- Sent by: `apps/web` (prod) — auth, magic links, invites
- Provider: Resend (SES once production access approves)
- Configured: CDK `app-stack.ts` → `EMAIL_FROM`
- DKIM: signed by provider on the `afframe.com` zone

### `no-reply@app-staging.afframe.com` (outbound)

- Sent by: `apps/web` (staging) — same purposes as prod
- Provider: Resend
- Configured: CDK `app-stack.ts` → `EMAIL_FROM`
- DKIM: signed by provider on the `afframe.com` zone

### `notifications@afframe.com` (outbound)

- Sent by: status-page stack on OVH VPS
- Provider: Resend
- Configured: OVH compose env (see [STATUS-PAGE.md](runbooks/STATUS-PAGE.md))
- DKIM: signed by provider on the `afframe.com` zone

---

## Adding or changing a host

Procedures live in the runbooks — they have the exact file-by-file steps and
authorization gates. Pick by host class:

- **AWS Fargate host** (web / api / admin): [AWS-DEPLOY.md](runbooks/AWS-DEPLOY.md) §§ 8-9
- **OVH-served host** (status / monitoring / future docs): [STATUS-PAGE.md](runbooks/STATUS-PAGE.md)
- **Cloudflare Worker host** (cache / future workers): [CI-TURBO-REMOTE-CACHE.md](runbooks/CI-TURBO-REMOTE-CACHE.md)
- **Inbound email alias**: Cloudflare dashboard → Email → Routing Rules
- **Outbound sender**: add identity in Resend, update relevant container env

After any rename, update this file's stanza and grep the repo for the old
hostname to catch hardcoded references. In particular, `packages/i18n/`
holds user-facing link targets (e.g. "Return to afframe.com") that are not
sourced from env vars and need a manual update on rename.
