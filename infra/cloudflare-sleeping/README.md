# Sleeping-page Worker

The "app is asleep" screen shown at the Cloudflare edge while the Fargate env
is cold-paused.

## Why this exists at the edge (not just a Next.js route)

The public hosts (`app`, `api`, `admin` + `-staging`) front the single Fargate
task through a **Cloudflare Tunnel** — `cloudflared` runs _inside_ the task
([ADR-0008](../../docs/adr/0008-cloudflare-tunnel-and-email.md)). A `cold-pause`
([ENV-POWER](../../docs/runbooks/ENV-POWER.md)) scales the task to 0, so
`cloudflared`, Next.js, and the API all stop together. The tunnel loses its
connector and Cloudflare serves its default **error 1033** screen (HTTP `530`).

That means **nothing Next.js-based can serve while paused** — not a `/sleeping`
route, not middleware, not an `/api/wake` handler. Vercel-style "maintenance
mode" middleware assumes the edge stays up independent of the app; on this
Tunnel→Fargate setup it dies with the task. So the page that shows while paused
has to live at the Cloudflare edge as static content.

`apps/web/app/sleeping/page.tsx` is the same page authored in the real design
system, for previewing/iterating while the app is up. `public/index.html` here
is its self-contained static twin and is the **canonical artifact** that
actually serves when paused — keep them in visual sync.

## How it works

- `public/index.html` — self-contained page (brand tokens inlined, animated CSS
  cat, no external fonts/scripts/images). Single source for the served page.
- `src/index.ts` — Worker that serves that asset as **HTTP 503** (browsers) or a
  JSON 503 (`api.*` hosts).
- The host **routes are bound only while paused** (`scripts/routes.sh`). When
  the app is live there are no bound routes, so this Worker gets **zero
  production traffic and costs nothing** — no per-request worker on the live app.

## One-time deploy

```bash
cd infra/cloudflare-sleeping
pnpm install
CLOUDFLARE_API_TOKEN=… CLOUDFLARE_ACCOUNT_ID=… pnpm deploy
```

Same `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` as the turbo-cache Worker.
`workers_dev: true` gives a `afframe-sleeping.<subdomain>.workers.dev` preview
URL — open it to see the page without binding it to any real host.

## Toggle (the "redirect when paused")

```bash
pnpm sleep    # bind routes  → sleeping page goes live on all hosts (~1s)
pnpm wake     # unbind routes → traffic flows to origin again
pnpm routes   # show currently bound routes
```

Order matters on resume: run `wake` **after** the env is healthy (the
`power.yml resume` step waits for `services-stable`), otherwise users hit a
still-booting origin and get 1033 again.

### Automatic (already wired)

`.github/workflows/power.yml` toggles the page with the env:

- `cold-pause` / `warm-pause` → binds this env's routes (`routes.sh on <env>`)
- `resume` → removes them, after the service is healthy (`routes.sh off <env>`)

The 5h **auto-cold-pause lambda** (`infra/cdk/lib/lambda/autostop`) also binds
the page when it trips — best-effort, so a Cloudflare hiccup never blocks the
cost-pause. It reads a Cloudflare API token (Zone:Read + Workers Routes:Edit)
from SSM SecureString **`/monorepo/shared/cloudflare-routes-token`**; until that
param is populated (Vault → SSM, or `aws ssm put-parameter`), the lambda logs
`sleeping page skip` and does nothing else. `power.yml` uses the GitHub
`CLOUDFLARE_API_TOKEN` secret instead and needs no SSM param.

The `pnpm sleep` / `pnpm wake` commands above remain for manual control.

## Edit the page

Edit `public/index.html` (and mirror visual changes into
`apps/web/app/sleeping/page.tsx`). Re-`pnpm deploy`. No app image rebuild.
