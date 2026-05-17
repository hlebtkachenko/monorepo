# Status Page

`status.afframe.com` is the public uptime + incident page for afframe customers. It runs
**OpenStatus self-hosted on the OVH VPS — not AWS** (independent failure domain; see
[ADR-0019](../adr/0019-status-page-and-uptime-monitoring.md)). Monitors are version-controlled
in [`infra/openstatus/openstatus.yaml`](../../infra/openstatus/openstatus.yaml). This runbook
covers the one-time deploy and day-2 operations. Until the deploy below is run, the page
does not exist.

## Topology

```
Customer ─▶ Cloudflare DNS/edge ─▶ status.afframe.com
                                    └─▶ Cloudflare Tunnel ─▶ OVH VPS (WSL2 Docker)
                                                              ├─ OpenStatus (7 containers)
                                                              └─ private-location probe
                                                                    │ HTTPS checks
                                                                    ▼
                                          app.afframe.com (AWS Fargate, eu-central-1)
                                          /api/health · /api/version
```

OpenStatus self-host = 7 containers: `workflows` (3000), `server` (3001), `dashboard`
(3002), `status-page` (3003), `libsql` (8080), `tinybird-local` (7181), `private-location`
(8081). DB is local libsql (SQLite) — no Turso cloud.

All secrets below are placeholders (`<NAME>`). Real values stay on the VPS / in the
operator's secret store — never commit them.

## Deploy — one-time

### Phase 1 — OpenStatus on the OVH VPS (WSL2 Ubuntu)

1. In WSL2, clone upstream and set the auth secret:

   ```bash
   git clone https://github.com/openstatusHQ/openstatus.git
   cd openstatus
   # .env.docker — set AUTH_SECRET to a fresh random value (openssl rand -base64 32)
   echo "AUTH_SECRET=<AUTH_SECRET>" >> .env.docker
   ```

2. Bring the stack up and confirm all 7 containers are healthy:

   ```bash
   DOCKER_BUILDKIT=1 docker compose up -d
   docker compose ps          # every service must read "healthy"
   ```

3. Run DB migrations, deploy Tinybird locally, copy its admin token into `.env.docker`,
   restart:

   ```bash
   docker compose exec server pnpm db:migrate      # exact target: see self-hosting guide
   tb --local deploy                                # the step people miss — do not skip
   # add TINYBIRD_TOKEN=<TINYBIRD_ADMIN_TOKEN> to .env.docker, then:
   docker compose restart
   ```

4. Open the dashboard at `http://localhost:3002` and create the workspace.

5. Set workspace feature limits. Self-host has no plan UI — limits are written directly to
   libsql over its HTTP endpoint (`localhost:8080`). Confirm the exact table/column for your
   OpenStatus version against the [self-hosting guide](https://docs.openstatus.dev/guides/self-hosting-openstatus/),
   then apply the documented one-time SQL. Record the command used in the VPS deploy notes.

6. Deploy the `private-location` probe with its key and ingest URL:

   ```bash
   # probe env: OPENSTATUS_KEY=<OPENSTATUS_KEY>  OPENSTATUS_INGEST_URL=<INGEST_URL>
   docker compose up -d private-location
   ```

   Note the private-location slug it registers — the `regions` value in `openstatus.yaml`
   must match it.

### Phase 2 — Expose status.afframe.com

7. Run `cloudflared` on the VPS (new tunnel, or a route on an existing one). Public
   Hostname `status.afframe.com` → `http://localhost:3003` (the `status-page` container).
8. The tunnel auto-creates the `status.afframe.com` CNAME in Cloudflare DNS — no manual
   record. Cloudflare terminates TLS. Do **not** open any VPS port; the path is loopback
   only (`netsh portproxy` / firewall holes are not needed and must not be added).
9. Set the custom domain `status.afframe.com` inside the OpenStatus dashboard.

### Phase 3 — Monitors + public page

10. Apply the monitors-as-code (from a checkout of this repo, or copy the file to the VPS):

    ```bash
    export OPENSTATUS_API_TOKEN=<OPENSTATUS_API_TOKEN>   # dashboard → Settings → API
    openstatus monitors apply -c infra/openstatus/openstatus.yaml --dry-run
    openstatus monitors apply -c infra/openstatus/openstatus.yaml
    ```

11. Build the **public** page: attach the three production monitors only
    (`web-app-prod`, `api-prod`, `dns-afframe`); group as "Web App" / "API"; publish to
    `status.afframe.com`.
12. Leave `staging-web` and `staging-api` **off** the public page — dashboard + alerts only.
13. Wire alerts → the incident Slack channel + email.

### Acceptance checklist

- [ ] `https://status.afframe.com` resolves and serves the OpenStatus page over valid TLS.
- [ ] Public page shows Web App + API operational; staging monitors exist but are private.
- [ ] An induced failure (pause a monitor target) flips the page to degraded/down and fires
      a Slack + email alert.
- [ ] No VPS port is publicly exposed (`docker compose ps` ports bind loopback only).

## Day-2 operations

### Add a monitor

Edit [`infra/openstatus/openstatus.yaml`](../../infra/openstatus/openstatus.yaml), open a
PR, then on the VPS run `openstatus monitors apply -c infra/openstatus/openstatus.yaml`
(`--dry-run` first). Attach to the public page in the dashboard if it should be public.

### Declare an incident

1. In the OpenStatus dashboard, create a status report on the public page; pick the
   affected component(s) and severity.
2. Post the initial message — use the SEV1/SEV2 templates in
   [`INCIDENT.md`](INCIDENT.md). For SEV1/2 this must happen within 15 minutes.
3. Post updates as the incident progresses; mark resolved with a root-cause one-liner.
   CLI alternative: `openstatus status-report create --page-id <ID> --title ... --status investigating`.

### Restart the private-location probe

```bash
docker compose restart private-location
docker compose logs -f private-location     # confirm it re-registers and checks resume
```

## Known gotchas

- **One probe only.** Self-host has a single private-location probe (one European vantage),
  not multi-region. Adequate for MVP; more regions = more probe containers.
- **`tb --local deploy`** is the step most self-host setups miss — without it Tinybird has
  no schema and checks do not record.
- **`IP Restriction` is insecure off-Vercel.** `X-Forwarded-For` is spoofable behind
  Cloudflare — do not rely on OpenStatus IP restriction for access control.
- **`apps/admin` and internal sidecars are not externally monitorable.** Admin has no
  production hostname yet; OpenFGA / Cerbos / pgBouncer are localhost-only inside the
  Fargate task. Extending `/api/health` to report sidecar health transitively is a separate
  follow-up.
- **Shared dependency.** Cloudflare fronts both the app and this page; a global Cloudflare
  outage takes down both. The realistic outage (an AWS region down) is fully covered.
- Monitor traffic (~1 request/minute to `app.afframe.com`) is negligible and will not trip
  the [ADR-0016](../adr/0016-cost-runaway-protection.md) cost alarms.

## See also

- [ADR-0019](../adr/0019-status-page-and-uptime-monitoring.md) — why OpenStatus, why off-AWS
- [`infra/openstatus/`](../../infra/openstatus/) — monitors-as-code
- [INCIDENT.md](INCIDENT.md) — incident workflow + status page message templates
- [OpenStatus self-hosting guide](https://docs.openstatus.dev/guides/self-hosting-openstatus/)
