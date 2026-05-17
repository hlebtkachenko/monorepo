# Status Page

`https://status.afframe.com` is the public uptime + incident page for afframe customers.
It runs **OpenStatus self-hosted on the OVH VPS — not AWS** (independent failure domain;
see [ADR-0019](../adr/0019-status-page-and-uptime-monitoring.md)). The OpenStatus admin
dashboard lives at `https://monitoring.afframe.com` (its own login). Monitors are
version-controlled in [`infra/openstatus/openstatus.yaml`](../../infra/openstatus/openstatus.yaml).

This runbook captures the deploy and day-2 operations **with every workaround the
upstream self-host story is missing.** Read the pre-flight section before deploying — it
will save hours.

## Topology

```
Customer ─▶ Cloudflare DNS/edge ─▶ status.afframe.com   (public page)
                                    └─▶ Cloudflare Tunnel ─▶ caddy:80 ─▶ status-page:3000
                  ─▶ monitoring.afframe.com (admin dashboard, login-gated)
                                    └─▶ Cloudflare Tunnel ─▶ dashboard:3000
                                                              │
                                                              ▼
                                                  OVH VPS (Windows Server 2025)
                                                  └─ WSL2 distro `openstatus` on C:
                                                       ├─ OpenStatus stack (8 containers)
                                                       ├─ caddy (reverse-proxy for path rewrite)
                                                       └─ cloudflared (tunnel connector)
                                                              │ HTTPS probes
                                                              ▼
                                          app.afframe.com  · api.afframe.com  · admin.afframe.com
                                          app-staging.afframe.com · api-staging.afframe.com · admin-staging.afframe.com
```

**9 containers in the `openstatus` distro:** `libsql` (8080, remapped to host `18080`),
`tinybird-local` (7181), `workflows` (3000), `server` (3001), `private-location` (8081),
`checker` (8082), `dashboard` (3002), `status-page` (3003), `caddy` (80), plus
`cloudflared` (tunnel — no port published).

All secrets below are placeholders (`<NAME>`). Real values stay on the VPS in
`/root/openstatus-deploy.env` (`chmod 600`) and in container `.env.docker`.

## Pre-flight: self-host realities (read first)

These are non-obvious gotchas the upstream OpenStatus docs do not call out — each one is a
hard requirement or a hard-won workaround:

1. **Use C:, not D:** for the WSL2 distro. The VPS's `D:` volume (labelled `HyperV`)
   benchmarked at **65 MB/s** vs C:'s **478 MB/s** — 7× slower. OpenStatus is DB-heavy
   (libsql/SQLite + Tinybird/ClickHouse + 8 container overlays). On D: it produced 47%
   I/O-wait, load average 7-8, and Next.js containers flapping. On C:, 2.5% I/O-wait and
   stable. The distro vhdx is ~16 GB; C: needs ~20 GB headroom.

2. **Coolify coexists** in the default WSL distro (`Ubuntu`). It runs Traefik on host
   `0.0.0.0:8080`. The OpenStatus `libsql` container wants `8080` too — **remap libsql
   host ports to `18080`/`15001`** in the compose. libsql is internal-only (other
   OpenStatus containers reach it as `libsql:8080` on the docker network) so the host port
   only matters if you want to curl libsql directly.

3. **Use the prebuilt-image compose** (`docker-compose.github-packages.yaml`) — pulls
   from `ghcr.io/openstatushq/openstatus-*:latest`. The build-from-source
   `docker-compose.yaml` makes the VPS build Next.js apps + a Bun monorepo (`bun install`
   on 1981 packages) — slow, disk-hungry, no benefit. The prebuilt compose has 8 services
   plus an extra `checker` service (Go binary) that has a **broken healthcheck**: its
   image is distroless (no shell), but the compose's `test: ["CMD-SHELL", "curl ..."]`
   needs a shell — change to `test: ["NONE"]` to disable. Container is functionally
   healthy (verified via `/health` from another container); only the docker healthcheck
   probe is broken upstream.

4. **CLI does not target self-host.** `openstatus-cli` (`internal/api/client.go`)
   hardcodes `https://api.openstatus.dev/v1` with no env override. On self-host, all
   monitor / page / notification CRUD goes through the dashboard UI. `openstatus.yaml`
   stays as operator intent (see `infra/openstatus/openstatus.yaml`).

5. **`NEXT_PUBLIC_URL` is build-time-baked.** OpenStatus's `.env.docker.example` claims
   runtime override works; for prebuilt images it does not. The `docker-entrypoint.sh`
   does no string-replacement at startup. Setting `NEXT_PUBLIC_URL` runtime affects only
   the server-side reads, not the client bundle. Workaround: per-service compose
   `environment:` override (`NEXT_PUBLIC_URL=https://status.afframe.com` for the
   `status-page` container; `https://monitoring.afframe.com` for `dashboard`).

6. **NextAuth needs explicit `AUTH_URL`.** Without it (with `AUTH_TRUST_HOST=true` alone),
   the dashboard derives the base URL from `HOSTNAME:PORT` (`0.0.0.0:3000`) and
   onboarding/auth callbacks emit cross-origin URLs → 401 / "Application error". Set
   `AUTH_URL=https://monitoring.afframe.com` in `.env.docker`.

7. **Custom-domain "Add" button fails.** OpenStatus dashboard's "Add custom domain"
   calls the **Vercel API** (cloud-only). On self-host: "Failed to add custom domain.
   Please try again." Workaround: **write `page.custom_domain` directly via raw SQL**
   AND **leave it empty** (`''`) — see "Phase 3 step 5" — the dashboard's host-routing
   middleware is also broken on self-host (upstream issue
   [#1968](https://github.com/openstatusHQ/openstatus/issues/1968), partial fix in
   [PR #2019](https://github.com/openstatusHQ/openstatus/pull/2019)). Empty `custom_domain`
   skips the broken middleware path; **Caddy** handles the public URL → slug-path
   mapping instead.

8. **Workspace feature limits are a paywall locally — and `plan='team'` alone is not
   enough.** Self-host inherits the OpenStatus Cloud `plan='free'` defaults: 1 monitor,
   no private-locations, no custom-domain, `periodicity: ["10m","30m","1h"]`. Bumping
   `plan='team'` is necessary but **not sufficient** — the `workspace.limits` column is
   a JSON blob that the dashboard reads at runtime, and the `UPDATE workspace SET plan=...`
   statement does **not** recompute it. A workspace created by sign-up has
   `limits='{}'` (empty), and several runtime gates (`if (!workspace.limits["status-subscribers"]) return`
   in `packages/api/src/router/email/index.ts`, plus identical gates in
   `packages/services/src/{maintenance,status-report}/notify.ts`) **silently skip**
   sending — the dashboard reports success and no email goes out. Fix: populate the
   limits JSON explicitly using the team-plan shape from
   `packages/db/src/schema/plan/config.ts`. See Phase 1 step 8 for the exact UPDATE.

9. **Resend rejects every default OpenStatus `from:`.** Senders are hardcoded across
   `packages/emails/src/client.tsx`, `apps/dashboard/src/lib/auth/index.ts`, and
   `apps/workflows/src/cron/monitor.ts`:
   - `notifications@notifications.openstatus.dev` (subscription confirm, status reports,
     magic-link-for-subscribers, team invitations, monitor alerts)
   - `thibault@openstatus.dev` and `welcome@openstatus.dev` (admin magic-link login,
     follow-up emails)

   Resend returns `403 validation_error: domain not verified` for all of them because we
   don't own `openstatus.dev`. There is **no env override** in source — the strings are
   compiled into the images.

   Workaround: a startup `sed` over the Next.js compiled chunks rewrites every hardcoded
   `*@openstatus.dev` to `notifications@afframe.com` (our Resend-verified domain) before
   `node server.js` starts. The script (`/opt/openstatus/patch-emails.sh`) is mounted into
   `dashboard` and `status-page`, and the compose `entrypoint:` is overridden to wrap it
   around the original `docker-entrypoint.sh` — see Phase 1 step 9. **The patch is required
   for sub-confirm emails and the dashboard magic-link.** The `workflows` and `server`
   containers are Bun single-file ELF binaries (string lengths are fixed at compile time)
   so sed cannot rewrite them in place — monitor-alert emails still go out from the
   hardcoded `openstatus.dev` sender and Resend rejects them. Fixing those requires a
   source patch + image rebuild (`docker compose -f docker-compose.yaml build workflows`),
   which is deferred until prod monitors are activated and alert email actually matters.

10. **WSL2 distro idle-stop.** With no attached session, WSL terminates the `openstatus`
    distro → `cloudflared` dies → tunnel down → 530 on the public URL. Fix: Windows
    Scheduled Task `OpenStatusKeepAlive` runs a `wsl -d openstatus … sleep infinity`
    process to hold it open. See "Phase 4 protection".

## Deploy — one-time

### Phase 1 — OpenStatus stack on the OVH VPS

1. **SSH to the VPS.** All commands below run from inside the `openstatus` WSL2 distro
   unless noted.

2. **Create the dedicated WSL2 distro on C:** (see pre-flight 1). Headless approach:
   export a minimal Ubuntu rootfs from Docker in the default `Ubuntu` distro, then
   `wsl --import openstatus C:\wsl\openstatus <rootfs.tar> --version 2`.

3. **Configure systemd + install Docker** in the new distro:
   - `/etc/wsl.conf`:
     ```ini
     [boot]
     systemd=true
     [user]
     default=root
     [network]
     hostname=openstatus
     generateHosts=true
     generateResolvConf=true
     ```
   - Install: `apt-get install -y --no-install-recommends systemd systemd-sysv dbus docker.io docker-compose-v2 git curl ca-certificates jq`. `systemd-sysv` is what creates `/sbin/init` → systemd; without it WSL falls back to its own init and docker.service won't start.
   - `wsl --terminate openstatus`. Next start boots with systemd and docker.service.

4. **Clone OpenStatus**:

   ```bash
   git clone --depth 1 https://github.com/openstatusHQ/openstatus.git /opt/openstatus
   cd /opt/openstatus
   ```

5. **Use the github-packages compose, patched** (per pre-flight 2 + 3):

   ```bash
   F=docker-compose.github-packages.yaml
   # remap libsql host ports off Coolify's 8080
   sed -i 's#- "8080:8080"#- "18080:8080"#' "$F"
   sed -i 's#- "5001:5001"#- "15001:5001"#' "$F"
   # disable broken checker healthcheck (distroless image, no shell)
   sed -i 's#test: \["CMD-SHELL", "curl -f http://localhost:8080/health || exit 1"\]#test: ["NONE"]#' "$F"
   ```

   Also add the `status-page` container's `NEXT_PUBLIC_URL` override (per pre-flight 5) —
   add this line into the `status-page` service's `environment:` block:

   ```yaml
   status-page:
     # ...
     environment:
       - DATABASE_URL=http://libsql:8080
       - PORT=3000
       - HOSTNAME=0.0.0.0
       - AUTH_TRUST_HOST=true
       - NEXT_PUBLIC_URL=https://status.afframe.com # ← add
   ```

   Add the Resend-`from:` patch wrapper (per pre-flight 9). Create
   `/opt/openstatus/patch-emails.sh`:

   ```sh
   #!/bin/sh
   # Rewrite hardcoded openstatus.dev Resend `from:` addresses in Next.js
   # compiled chunks before the original entrypoint exec's the Node server.
   set -e
   find /app -type f \( -name '*.js' -o -name '*.cjs' -o -name '*.mjs' \) \
     -exec grep -l 'openstatus\.dev' {} + 2>/dev/null \
     | xargs -r sed -i \
       -e 's/notifications@notifications\.openstatus\.dev/notifications@afframe.com/g' \
       -e 's/welcome@openstatus\.dev/welcome@afframe.com/g' \
       -e 's/thibault@notifications\.openstatus\.dev/notifications@afframe.com/g' \
       -e 's/thibault@openstatus\.dev/notifications@afframe.com/g' \
       -e 's|\${t\.page\.slug}\.openstatus\.dev/verify/|status.afframe.com/verify/|g' \
       -e 's|\${t\.page\.slug}\.openstatus\.dev/unsubscribe/|status.afframe.com/unsubscribe/|g' \
       -e 's|\${t\.page\.slug}\.openstatus\.dev/manage/|status.afframe.com/manage/|g' \
       -e 's|\${pageSlug}\.openstatus\.dev|status.afframe.com|g' \
       -e 's|\${req\.pageSlug}\.openstatus\.dev|status.afframe.com|g' \
     || true
   exec "$@"
   ```

   `chmod +x /opt/openstatus/patch-emails.sh`. Then patch `dashboard` and `status-page`
   in the compose to mount the script + override entrypoint:

   ```yaml
   dashboard:
     # ...
     user: "0" # sed needs write access to build-baked chunks
     entrypoint: ["/bin/sh", "/opt/patch-emails.sh", "docker-entrypoint.sh"]
     command: ["node", "server.js"] # must restate when entrypoint is overridden
     volumes:
       - ./patch-emails.sh:/opt/patch-emails.sh:ro
   status-page:
     # ...
     user: "0"
     entrypoint: ["/bin/sh", "/opt/patch-emails.sh", "docker-entrypoint.sh"]
     command: ["node", "server.js"]
     volumes:
       - ./patch-emails.sh:/opt/patch-emails.sh:ro
   ```

   The compose `entrypoint:` override resets the image CMD, so `command: ["node", "server.js"]`
   must be restated. Running as `user: "0"` is acceptable here because there is no public
   ingress (Cloudflare-Tunnel-only) and the stack is single-tenant.

6. **Build `.env.docker`** from the example:

   ```bash
   cp .env.docker.example .env.docker
   chmod 600 .env.docker
   ```

   Required keys (the ones marked `[REQUIRED]` plus the self-host fixes):

   ```ini
   AUTH_SECRET=<openssl rand -base64 32>
   AUTH_URL=https://monitoring.afframe.com         # ← pre-flight 6
   DATABASE_URL=http://libsql:8080
   DATABASE_AUTH_TOKEN=
   SELF_HOST="true"
   TINYBIRD_URL=http://tinybird-local:7181
   NEXT_PUBLIC_URL=https://monitoring.afframe.com  # default for dashboard; status-page overrides
   RESEND_API_KEY=<resend_api_key>                 # from Resend dashboard
   OPENSTATUS_KEY=<from-Private-Location-step>     # filled later — Phase 3 step 2
   OPENSTATUS_INGEST_URL=http://workflows:3000
   TUNNEL_TOKEN=<from-Cloudflare-Tunnel-step>      # filled later — Phase 2
   ```

7. **Bring the stack up + run migrations**:

   ```bash
   docker compose -f docker-compose.github-packages.yaml pull
   docker compose -f docker-compose.github-packages.yaml up -d
   # github-packages images do NOT auto-migrate. Run a one-off bun container:
   docker run --rm --network openstatus \
       -v /opt/openstatus:/app -w /app/packages/db \
       --env-file /opt/openstatus/.env.docker \
       -e DATABASE_URL=http://libsql:8080 \
       oven/bun:1.3.6 sh -c "bun install --frozen-lockfile || bun install; bun run migrate"
   ```

   Verify 8 containers `Up (healthy)` except `checker` (Up, no health — see pre-flight 3).
   Verify schema landed: 43 tables in libsql.

8. **Bump workspace feature limits** (per pre-flight 8). Run this **after the workspace
   row exists** (sign in once via the dashboard so step 14 below creates it), then reload.
   Both `plan` AND `limits` must be set — `limits` is the gate the runtime actually reads,
   and `UPDATE plan='team'` alone leaves `limits='{}'` and silently skips email sends.

   ```bash
   # Step A — set plan label
   docker exec openstatus-server sh -c \
     'curl -s http://libsql:8080/v2/pipeline -H "Content-Type: application/json" \
      -d "{\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":\"UPDATE workspace SET plan=\\\"team\\\" WHERE id=1\"}},{\"type\":\"close\"}]}"'

   # Step B — populate limits JSON to match the team plan shape from
   # packages/db/src/schema/plan/config.ts. Without this, status-subscribers
   # and several other gates remain disabled even with plan='team'.
   LIMITS='{"monitors":50,"synthetic-checks":300,"periodicity":["30s","1m","5m","10m","30m","1h"],"multi-region":true,"max-regions":35,"data-retention":"12 months","status-pages":5,"page-components":50,"maintenance":true,"monitor-values-visibility":true,"response-logs":true,"screenshots":true,"otel":true,"status-subscribers":true,"custom-domain":true,"i18n":true,"password-protection":true,"email-domain-protection":false,"ip-restriction":false,"white-label":true,"no-index":true,"notifications":true,"sms":true,"sms-limit":100,"pagerduty":true,"opsgenie":true,"grafana-oncall":true,"whatsapp":true,"notification-channels":20,"members":"Unlimited","audit-log":true,"private-locations":true,"slack-agent":true}'
   jq -nc --arg lim "$LIMITS" '{requests:[{type:"execute",stmt:{sql:"UPDATE workspace SET limits = ? WHERE id = 1",args:[{type:"text",value:$lim}]}},{type:"close"}]}' \
     | docker exec -i openstatus-server sh -c \
       'curl -s http://libsql:8080/v2/pipeline -H "Content-Type: application/json" --data-binary @-'
   ```

   Confirm with `SELECT plan, limits FROM workspace`: `plan='team'` AND `limits` is the
   full JSON above (not `{}`).

### Phase 2 — Cloudflare Tunnel + Caddy reverse-proxy

9. **Create the Cloudflare Tunnel.** From any machine with a Cloudflare API token
   (`Account · Cloudflare Tunnel · Edit` + `Zone · DNS · Edit` for `afframe.com`):

   ```bash
   # See pre-flight + scripts; condensed shape:
   ACCT=<your-cloudflare-account-id>
   ZONE=<afframe.com-zone-id>
   # POST /accounts/{ACCT}/cfd_tunnel  → {name: "openstatus", config_src: "cloudflare"}
   # Save returned tunnel id (TID) and tunnel connector token into .env.docker as TUNNEL_TOKEN
   # PUT /accounts/{ACCT}/cfd_tunnel/{TID}/configurations with ingress (see step 11 below)
   # POST /zones/{ZONE}/dns_records  CNAME status      -> {TID}.cfargotunnel.com (proxied)
   # POST /zones/{ZONE}/dns_records  CNAME monitoring  -> {TID}.cfargotunnel.com (proxied)
   ```

10. **Add the `cloudflared` service to the compose** (it consumes `TUNNEL_TOKEN` from
    `.env.docker`):

    ```yaml
    cloudflared:
      container_name: openstatus-cloudflared
      image: cloudflare/cloudflared:latest
      command: tunnel --no-autoupdate run
      env_file:
        - .env.docker
      networks:
        - openstatus
      depends_on:
        - status-page
      restart: unless-stopped
    ```

11. **Add Caddy** for the status.afframe.com → status-page path rewrite (per pre-flight 7
    — the OpenStatus middleware bug means we cannot use the upstream "custom domain"
    feature). Create `/opt/openstatus/caddy/Caddyfile`:

    ```caddyfile
    :80 {
        @assets path /_next/* /favicon.ico /robots.txt /sitemap.xml /api/*
        @prefixed path /afframe-status /afframe-status/*

        handle @assets {
            reverse_proxy status-page:3000
        }
        handle @prefixed {
            reverse_proxy status-page:3000
        }
        handle {
            rewrite * /afframe-status/en{uri}
            reverse_proxy status-page:3000
        }
    }
    ```

    `afframe-status` is the page's slug in libsql (`SELECT slug FROM page WHERE id=1`).
    Adjust if you used a different slug. Then add a `caddy` service to the compose:

    ```yaml
    caddy:
      container_name: openstatus-caddy
      image: caddy:2-alpine
      networks:
        - openstatus
      volumes:
        - ./caddy/Caddyfile:/etc/caddy/Caddyfile:ro
      depends_on:
        - status-page
      restart: unless-stopped
    ```

    Bring them up: `docker compose -f docker-compose.github-packages.yaml up -d caddy cloudflared`.

12. **Tunnel ingress config** (PUT to `/accounts/{ACCT}/cfd_tunnel/{TID}/configurations`):

    ```json
    {
      "config": {
        "ingress": [
          { "hostname": "status.afframe.com", "service": "http://caddy:80" },
          {
            "hostname": "monitoring.afframe.com",
            "service": "http://dashboard:3000"
          },
          { "service": "http_status:404" }
        ]
      }
    }
    ```

    `cloudflared` picks up new ingress within ~30s — no restart needed.

13. **Verify**: `curl -L https://status.afframe.com/` → eventual HTTP 200, page title
    `Afframe Status | Status Page`. `curl https://monitoring.afframe.com/` → 200 → `/login`.

### Phase 3 — Workspace, monitors, page, notification (dashboard UI)

14. **Sign up** at `https://monitoring.afframe.com`. The magic-link email won't arrive
    (pre-flight 9). Grab it from logs:

    ```bash
    docker logs --tail 80 openstatus-dashboard 2>&1 | grep 'Magic Link'
    ```

    Open the link → you're logged in. Workspace is auto-created (random slug like
    `thousands-agency`). Rename it in Settings if desired.

    If you skipped the workspace plan-bump in step 8, run it NOW and reload the dashboard:
    `UPDATE workspace SET plan='team' WHERE id=1`.

15. **Private Location** — sidebar **Private Locations** → **Create**:
    - Name: `OVH EU`
    - The form auto-generates a **Token**. Copy it. Add to `.env.docker`:
      `OPENSTATUS_KEY=<token>`. Then restart the probe:
      `docker compose -f docker-compose.github-packages.yaml up -d private-location`.

16. **Monitors** — create the 7 from
    [`infra/openstatus/openstatus.yaml`](../../infra/openstatus/openstatus.yaml). For each:
    - Region → `OVH EU` (the private location you just made). Other (cloud) regions are
      visible in the UI but do NOT work on self-host — no cloud probes are connected to
      our workspace.
    - The dashboard's pre-save checker test will warn `Checker response is not valid`
      (the response-validator's `region` enum doesn't include private-location slugs —
      an upstream self-host quirk). **Save anyway**. Scheduled checks run fine.
    - For production monitors (`web-app-prod`, `api-prod`, `admin-prod`): set
      **Active: OFF**. Production is not deployed yet; flip on after the first prod deploy.
    - For the DNS monitor: assertion `A · Not Equal · 0.0.0.0` (the UI requires a target
      — no "not empty" option).

17. **Status Page** — sidebar **Status Pages** → **Create**:
    - Title: `Afframe Status`
    - Slug: pick one; **record it** — Caddy's Caddyfile references it.
    - Attach the 4 public monitors with groups: `Web App` (web-app-prod), `API` (api-prod),
      `Admin` (admin-prod), and DNS (ungrouped or its own group).
    - Save.

18. **Custom domain** — DO NOT use the dashboard's "Add custom domain" button (pre-flight 7).
    Set it via raw SQL — and set it back to **empty** so the broken middleware doesn't
    route on it. Caddy handles the public URL:

    ```bash
    # Optional: set the canonical custom_domain for record-keeping then empty it.
    docker exec openstatus-server sh -c \
      'curl -s http://libsql:8080/v2/pipeline -H "Content-Type: application/json" \
       -d "{\"requests\":[{\"type\":\"execute\",\"stmt\":{\"sql\":\"UPDATE page SET custom_domain=\\\"\\\", published=1 WHERE id=1\"}},{\"type\":\"close\"}]}"'
    docker compose -f docker-compose.github-packages.yaml up -d status-page
    ```

    Now `status.afframe.com/` (via Caddy → `/afframe-status/en` → status-page) renders the
    real page.

19. **Notification** — sidebar **Notifications** → **Create**:
    - Type: **Email**
    - Recipient: `status-alerts@afframe.com` (or any `*@afframe.com` alias — Cloudflare
      Email Routing catch-all forwards to `EMAIL_FORWARD_TO`)
    - Attach to: all 7 monitors
    - Save

    Resend send (pre-flight 9): OpenStatus default `from:` is `thibault@openstatus.dev` —
    not on our Resend domain. Either (a) configure a Resend-verified `noreply@afframe.com`
    via a sender override (no UI for this on self-host today — file a follow-up issue), or
    (b) rely on the magic-link-in-logs flow for login and accept email-alert delivery is
    best-effort until upstream supports a configurable `from`. For incident comms the
    dashboard's status-report flow + `INCIDENT.md` templates carry SEV1/2 communication.

### Phase 4 — Protection (keep it up, survive reboots)

20. **`OpenStatusKeepAlive` Windows Scheduled Task.** WSL2 terminates idle distros;
    `cloudflared` lives inside `openstatus`, so an idle distro means a dead tunnel
    (pre-flight 10). Keep the distro held open with a long-running `wsl … sleep infinity`
    session, restart-on-failure.

    Keep-alive script `/opt/openstatus/keepalive.sh` (inside the distro):

    ```bash
    #!/usr/bin/env bash
    set -u
    for i in $(seq 1 90); do docker info >/dev/null 2>&1 && break; sleep 2; done
    cd /opt/openstatus
    docker compose -f docker-compose.github-packages.yaml up -d || true
    exec sleep infinity
    ```

    `chmod +x` it. Then on Windows (PowerShell as Hleb or via SSH):

    ```powershell
    $action = New-ScheduledTaskAction -Execute "wsl.exe" `
        -Argument "-d openstatus -u root -- bash /opt/openstatus/keepalive.sh"
    $tStart = New-ScheduledTaskTrigger -AtStartup
    $tLogon = New-ScheduledTaskTrigger -AtLogOn
    $settings = New-ScheduledTaskSettingsSet `
        -ExecutionTimeLimit ([TimeSpan]::Zero) `
        -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) `
        -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
        -MultipleInstances IgnoreNew
    $principal = New-ScheduledTaskPrincipal -UserId "Hleb" `
        -LogonType Interactive -RunLevel Highest
    Register-ScheduledTask -TaskName "OpenStatusKeepAlive" `
        -Action $action -Trigger $tStart,$tLogon `
        -Settings $settings -Principal $principal -Force
    Start-ScheduledTask -TaskName "OpenStatusKeepAlive"
    ```

    `LogonType Interactive` means the task runs when Hleb is logged on (RDP session,
    including disconnected, counts). For **reboot-survival without an active login**,
    upgrade to `-LogonType Password` and store Hleb's Windows password (or `S4U` if
    domain-joined). The `Ubuntu` distro that hosts the gh-runner uses the SYSTEM-task
    pattern (`GHRunnerStarter`); replicating that for `openstatus` requires registering
    the distro under SYSTEM (export → unregister-as-Hleb → import-as-SYSTEM via a one-shot
    SYSTEM task), which loses Hleb-SSH access to `wsl -d openstatus`. Default is the
    Hleb-Interactive task; upgrade only if a reboot-without-login scenario is a concern.

21. **Container memory caps.** Apply unconditionally — they have negligible overhead and
    prevent a single container leaking and starving the others. Measured steady-state
    usage in parentheses:

    ```yaml
    services:
      tinybird-local:
        mem_limit: 4g # (~1.4 GiB; ClickHouse-based, heaviest)
      libsql:
        mem_limit: 256m # (~10 MiB)
      workflows:
        mem_limit: 512m # (~140 MiB)
      server:
        mem_limit: 512m # (~140 MiB)
      dashboard:
        mem_limit: 512m # (~310 MiB)
      status-page:
        mem_limit: 512m # (~230 MiB)
      private-location:
        mem_limit: 128m # (~4 MiB)
      checker:
        mem_limit: 128m # (~10 MiB)
      cloudflared:
        mem_limit: 128m # (~25 MiB)
      caddy:
        mem_limit: 64m # (~20 MiB)
    ```

    Total cap ~6.6 GiB; WSL2 distro has ~11 GiB available.

## Acceptance

After Phase 1-4 complete:

- [ ] `https://status.afframe.com` returns HTTP 200, valid TLS, title `Afframe Status | Status Page`
- [ ] `https://monitoring.afframe.com` returns HTTP 200 → redirects to `/login` (login-gated)
- [ ] `docker compose ps`: 9 containers Up — 7 healthy, 1 Up-no-health (`checker`),
      `cloudflared` Up
- [ ] DNS monitor active and reporting; staging monitors active; production monitors paused
- [ ] An induced failure (pause a staging monitor target — `docker stop` something we
      monitor) flips the page to degraded/down for that group AND fires the email
      notification (check Cloudflare Email Routing forwarding logs)
- [ ] `wsl -l -v` shows `openstatus  Running` even after 5 minutes idle (keep-alive task
      holds it)
- [ ] No VPS port publicly exposed (`docker compose ps` ports bind loopback only;
      cloudflared is outbound)

## Day-2 operations

### Add a monitor

1. Edit [`infra/openstatus/openstatus.yaml`](../../infra/openstatus/openstatus.yaml) (PR).
2. In the dashboard: **Monitors → Create new** matching the YAML entry. Region `OVH EU`.
3. If public: attach to the status page in **Status Pages → Edit components**.
4. The CLI workflow (`openstatus monitors apply`) does NOT work — pre-flight 4.

### Activate the production monitors (after prod deploys)

```sql
UPDATE monitor SET active=1 WHERE name IN ('App', 'API', 'Admin');
```

Or toggle each in the dashboard. Update `openstatus.yaml` (`active: true`) in the same PR.

### Declare an incident

1. Dashboard → status page → **Status Reports → Create**.
2. Status: `investigating` / `identified` / `monitoring` / `resolved`.
3. Pick affected components, write the message — see SEV1/2 templates in
   [`INCIDENT.md`](INCIDENT.md). SEV1/2 must be posted within 15 minutes.
4. Add updates as the incident progresses; mark `resolved` with a root-cause one-liner.

### Restart the private-location probe

```bash
docker compose -f /opt/openstatus/docker-compose.github-packages.yaml \
    --project-directory /opt/openstatus restart private-location
docker logs -f openstatus-private-location
```

### Rotate the OpenStatus admin password / re-auth

Magic-link login: enter email at `https://monitoring.afframe.com/login`, fetch the link
from logs (`docker logs openstatus-dashboard | grep 'Magic Link'`), open it.

### Update OpenStatus to a newer image

```bash
cd /opt/openstatus && git pull
docker compose -f docker-compose.github-packages.yaml pull
docker compose -f docker-compose.github-packages.yaml up -d
```

Re-check the pre-flight workarounds — the compose file patches (libsql ports, checker
healthcheck, `status-page` NEXT_PUBLIC_URL override) get clobbered on `git pull`. Re-apply
or keep them in a versioned overlay file. Watch upstream issue
[#1968](https://github.com/openstatusHQ/openstatus/issues/1968) and PR
[#2029](https://github.com/openstatusHQ/openstatus/pull/2029) — when the full self-host
custom-domain fix lands, the Caddy hack and the empty `custom_domain` can be dropped.

## Known gotchas (recap)

All pre-flight items are also gotchas; the ones that bite during operation:

- **One probe only.** Self-host has a single private-location probe (one European
  vantage), not multi-region. To add vantages: deploy another `private-location`
  container on a different VPS / cloud, register as a separate private location.
- **Resend `from:` is hardcoded across the source.** The `patch-emails.sh` startup wrapper
  (pre-flight 9) rewrites every `*@openstatus.dev` sender to `notifications@afframe.com`
  inside the `dashboard` and `status-page` Next.js bundles — these cover sub-confirm,
  page magic-link, status-report broadcast, and admin magic-link. The `workflows` and
  `server` containers are Bun single-file binaries (fixed-length string literals) so
  in-place sed won't work — monitor-alert sends from `workflows` still hit the hardcoded
  sender and Resend rejects them. Activate prod monitors only after rebuilding those two
  images from a source-patched fork, or accept that alert email is best-effort while
  status-page + dashboard email flows work.
- **Workspace `limits` is a separate gate from `plan`.** `UPDATE workspace SET plan='team'`
  does NOT recompute the `limits` JSON; the dashboard reads `limits` directly and the gate
  `if (!limits["status-subscribers"]) return;` silently skips every subscription-email
  send. Always set both — see Phase 1 step 8.
- **`IP Restriction` is insecure off-Vercel.** `X-Forwarded-For` is spoofable behind
  Cloudflare — do not rely on OpenStatus IP restriction.
- **Internal sidecars not externally monitorable.** OpenFGA / Cerbos / pgBouncer are
  localhost-only inside the Fargate task. Extending `/api/health` to report sidecar
  health transitively is a separate follow-up.
- **Shared dependency.** Cloudflare fronts both the app and this page; a global
  Cloudflare outage takes down both. The realistic outage (AWS region down) is fully
  covered.
- Monitor traffic (~1 request/minute per active monitor) is negligible and will not trip
  the [ADR-0016](../adr/0016-cost-runaway-protection.md) cost alarms.

## Backlog — deferred follow-ups (with triggers)

Three known limitations have backlog issues with explicit "when to pick this up" triggers. Each
is operationally fine to leave alone today; pick up only when the trigger fires.

- [AFF-151](https://linear.app/hapddev/issue/AFF-151) — **rebuild `workflows` + `server` images**
  to fix the monitor-alert `from:` (Bun ELF binaries; in-place sed can't reach them).
  Trigger: production monitors activated (any alert send is then load-bearing), or staging
  email-alert delivery becomes a team workflow.
- [AFF-152](https://linear.app/hapddev/issue/AFF-152) — **deploy Tinybird local pipes** to
  populate the dashboard uptime charts. Trigger: customer-facing SLA reporting (TOS / sales
  deck), DORA Article 8 audit, or a one-shot self-host deploy script ships upstream.
- [AFF-153](https://linear.app/hapddev/issue/AFF-153) — **drop the Caddy reverse-proxy +
  URL-template sed** once upstream custom-domain fix ships. Trigger: OpenStatus
  [PR #2029](https://github.com/openstatusHQ/openstatus/pull/2029) (or equivalent) merges
  and ships in `ghcr.io/openstatushq/openstatus-status-page:latest`.

## See also

- [ADR-0019](../adr/0019-status-page-and-uptime-monitoring.md) — why OpenStatus, why off-AWS
- [`infra/openstatus/`](../../infra/openstatus/) — monitors-as-code
- [INCIDENT.md](INCIDENT.md) — incident workflow + status page message templates
- [OpenStatus self-hosting guide](https://docs.openstatus.dev/guides/self-hosting-openstatus/)
- [OpenStatus issue #1968](https://github.com/openstatusHQ/openstatus/issues/1968) — custom-domain self-host bug (workarounds in Phase 3 step 7 + 11)
- [OpenStatus PR #2029](https://github.com/openstatusHQ/openstatus/pull/2029) — community fix tracking
