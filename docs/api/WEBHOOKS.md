# Webhooks — Contract + Design

> **[Concept]** Not implemented. Tracked under the developer-platform initiative ([`ADR-0023`](../adr/0023-public-api-developer-platform.md)).

The webhook contract for `api.afframe.com/v1`. Adopts the [Standard Webhooks](https://www.standardwebhooks.com/) spec (Svix-led; used by Resend, Linear, Lob, Brex). Consumers built against this contract are portable across whichever webhook backend Afframe runs.

---

## 1. Decisions

| Question                | Answer                                                                                              | Why                                                                          |
| ----------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Spec                    | [Standard Webhooks](https://www.standardwebhooks.com/)                                              | Ecosystem traction; libraries in every language; ngrok built-in verify       |
| Backend at launch       | Svix Cloud free tier (50k msgs/mo)                                                                  | Avoids 2-3 engineer-months of durable-delivery work                          |
| Backend at scale        | Hook0 self-hosted on existing OVH/AWS                                                               | Crossover at ~€500/mo. Same Standard Webhooks signature contract = portable. |
| Signing                 | HMAC-SHA256 over `${id}.${timestamp}.${body}`                                                       | Standard Webhooks default                                                    |
| Headers                 | `webhook-id`, `webhook-timestamp`, `webhook-signature`                                              | Standard Webhooks                                                            |
| Replay tolerance        | 5-minute timestamp window                                                                           | Stripe default                                                               |
| Replay dedup            | Consumer-side on `webhook-id` (documented contract)                                                 | Server-side nonce list doesn't scale                                         |
| Delivery                | At-least-once. Retry 1s, 2s, 4s, 8s, 16s, 32s, 1m, 4m, 16m, 1h, cap. 24h window. Dead-letter after. | Hookdeck-recommended curve with jitter                                       |
| Subscription model      | Per-endpoint + per-event-type opt-in. One secret per endpoint.                                      | Stripe pattern. Rotatable, two active during rotation.                       |
| Schema versioning       | Independent of REST. `api_version` field in envelope.                                               | Decouples webhook stability from REST evolution                              |
| Local testing           | `afframe listen --forward-to http://localhost:3000/webhooks` ([CLI](./CLI.md))                      | Stripe-CLI clone                                                             |
| Force-trigger (sandbox) | `POST /v1/sandbox/fire_webhook`                                                                     | Plaid pattern, see [`SANDBOX.md`](./SANDBOX.md)                              |

---

## 2. Envelope

Standard Webhooks envelope, with one extension (`api_version`):

```json
{
  "id": "evt_01HXY...",
  "type": "invoice.paid",
  "api_version": "2026-05-01",
  "created": "2026-05-20T08:33:12.412Z",
  "data": {
    "object": {
      "id": "inv_01HXY...",
      "status": "paid",
      "total": { "amount": "1234500", "currency": "CZK" },
      "paid_at": "2026-05-20T08:33:12.000Z"
    }
  }
}
```

- `id` — globally unique. Consumers MUST dedup on this. ULID prefixed `evt_`.
- `type` — dotted, lower-snake. See [event catalog](#5-event-catalog).
- `api_version` — the webhook schema version on the day this subscription was created. Pinning shields consumers from REST evolution.
- `created` — ISO-8601, UTC.
- `data.object` — full resource shape, identical to the REST `GET /v1/<resource>/<id>` response.

---

## 3. Headers + signature

```
POST /webhooks/afframe HTTP/1.1
Host: customer.example.com
Content-Type: application/json
webhook-id: evt_01HXY...
webhook-timestamp: 1747728192
webhook-signature: v1,gShV4SQEAVm5C5BdFG/+nMjs2tg7HCjV9rTl8eQH6Vw=
```

### Verifying (pseudo-code)

```ts
import crypto from "node:crypto"

function verify(body: string, headers: Headers, secret: string): boolean {
  const id = headers.get("webhook-id")!
  const ts = Number(headers.get("webhook-timestamp"))
  const sigHeader = headers.get("webhook-signature")! // "v1,base64sig v1,base64sig2"

  // Reject if older than 5 minutes
  if (Math.abs(Date.now() / 1000 - ts) > 300) return false

  const signedPayload = `${id}.${ts}.${body}`
  const expected = crypto
    .createHmac("sha256", base64Decode(secret))
    .update(signedPayload)
    .digest("base64")

  // Header may include multiple "v1,..." entries (rotation). Any match passes.
  return sigHeader
    .split(" ")
    .map((s) => s.replace(/^v1,/, ""))
    .some((s) =>
      crypto.timingSafeEqual(
        Buffer.from(s, "base64"),
        Buffer.from(expected, "base64"),
      ),
    )
}
```

Secrets are base64-encoded (Standard Webhooks default). Constant-time compare always.

`@afframe/sdk` exports `verifyWebhook(body, headers, { secret })` — partners should not reimplement.

---

## 4. Delivery + retry

### Curves

Exponential with jitter:

```
1s → 2s → 4s → 8s → 16s → 32s → 1m → 4m → 16m → 1h → 1h → 1h → 1h ...
```

Capped at 1h between attempts. Total retry window: 24h. Beyond that the message lands in the per-endpoint dead-letter queue, visible in the partner dashboard.

### Response semantics

| Consumer response | Meaning                                                             |
| ----------------- | ------------------------------------------------------------------- |
| 2xx               | Ack. No further attempts.                                           |
| 3xx               | Treated as failure (we don't follow).                               |
| 4xx except 410    | Retry. Likely transient.                                            |
| 410 Gone          | Permanent. Disable endpoint after N consecutive 410s (default N=5). |
| 5xx               | Retry.                                                              |
| Timeout (10 s)    | Retry.                                                              |

### Auto-disable

After 5 consecutive failures with no 2xx, the endpoint is marked `disabled`. The partner sees a banner in the dashboard and can re-enable. Auto-disable does not delete history.

---

## 5. Event catalog

Versioned in lockstep with the API path. Adding a new event type is MINOR; removing one is MAJOR (requires Sunset header + 6-month deprecation).

### Live today

None — webhooks are concept-only.

### Concept (launch set, AFF-71 + later)

| Type                    | Trigger                          |
| ----------------------- | -------------------------------- |
| `invoice.created`       | Draft invoice created            |
| `invoice.finalized`     | Draft → finalized                |
| `invoice.sent`          | Sent to customer                 |
| `invoice.paid`          | Payment matched in full          |
| `invoice.voided`        | Voided                           |
| `journal.posted`        | Journal entry posted             |
| `journal.reversed`      | Journal reversed                 |
| `account.created`       | New account in chart of accounts |
| `webhook_endpoint.ping` | Test ping (manual trigger)       |

Each event has a dedicated page under `/docs/webhooks/events/<type>` with payload sample + schema link.

---

## 6. Subscription API

```http
POST /v1/webhook_endpoints
Content-Type: application/json
Authorization: Bearer affk_...

{
  "url": "https://customer.example.com/webhooks/afframe",
  "events": ["invoice.created", "invoice.paid"],
  "description": "Production sync"
}
```

```http
{
  "id": "we_01HXY...",
  "url": "https://customer.example.com/webhooks/afframe",
  "events": ["invoice.created", "invoice.paid"],
  "secret": "whsec_BASE64SECRET...",                  // shown ONCE on create
  "status": "enabled",
  "created_at": "2026-05-20T..."
}
```

Other operations: `GET /v1/webhook_endpoints`, `GET /v1/webhook_endpoints/{id}`, `PATCH /v1/webhook_endpoints/{id}`, `POST /v1/webhook_endpoints/{id}/rotate_secret`, `DELETE /v1/webhook_endpoints/{id}`.

`POST /v1/webhook_endpoints/{id}/rotate_secret` returns a new secret and keeps the old secret valid for 24h (two-secret window). Consumers must accept either during the window.

---

## 7. Local testing

```bash
# Tunnel the API's event stream to localhost
$ afframe listen --forward-to http://localhost:3000/webhooks
> Listening for events. Forwarding to http://localhost:3000/webhooks
> Session signing secret: whsec_TESTONLY...
> Press Ctrl-C to stop

# In another terminal — fire a fixture event
$ afframe trigger invoice.paid
> Triggered evt_01HXY... → forwarded to localhost
```

`listen` opens a websocket to `api.afframe.com/v1/cli/listen`, streams events for the principal's sandbox org, and forwards them to `--forward-to` with valid signatures using a per-session secret. The session secret is **separate** from any registered endpoint's secret — it lives only for the duration of the `listen` process.

`trigger` is sugar around `POST /v1/sandbox/fire_webhook` ([`SANDBOX.md`](./SANDBOX.md)).

---

## 8. Build-vs-buy: Svix Cloud as launch backend

| Concern                    | Build in-house      | Svix Cloud                   | Self-host Hook0             |
| -------------------------- | ------------------- | ---------------------------- | --------------------------- |
| Durable retry curves       | 2-3 eng-months      | Free tier covers it          | Built-in, MIT               |
| Dashboard                  | More months         | Bundled                      | Bundled                     |
| Standard Webhooks contract | Yes (we'd write it) | Yes (Svix authored the spec) | Yes (compatible)            |
| Free tier                  | n/a                 | 50k msgs/mo                  | Self-host = infra cost only |
| Cost at 10M msgs/mo        | High dev cost       | ~€1,485/mo Pro               | ~€50/mo VPS/ECS             |
| Lock-in                    | Internal            | Backend internals            | Open-source parity          |

**Plan**: Svix Cloud free tier for launch. Migrate to self-hosted Hook0 on the existing OVH or ECS infra when monthly volume crosses ~50k msgs (or operationally — when reading Svix's bill becomes annoying). The Standard Webhooks signature contract makes consumers portable across both.

`/v1/webhook_endpoints` is our own API surface. Svix is the implementation detail. The partner never sees `svix.com`.

---

## 9. Failure modes + runbook hooks

- **Mass delivery failure to one endpoint** → auto-disable after 5 consecutive failures, banner in partner dashboard, no impact on other endpoints.
- **Provider outage (Svix)** → backlog accumulates in Svix; we surface "Webhooks delayed" component on `status.afframe.com`.
- **Secret leak** → partner rotates via `POST /v1/webhook_endpoints/{id}/rotate_secret`. Old secret valid 24h to allow consumer config update.
- **Replay attack** → 5-min timestamp window + consumer dedup on `webhook-id` defeats it.

Operational runbook: [`docs/runbooks/INCIDENT.md`](../runbooks/INCIDENT.md) (concept extension for "webhook backlog").

---

## 10. References

- [Standard Webhooks](https://www.standardwebhooks.com/) — spec
- [Svix Cloud pricing](https://www.svix.com/pricing/)
- [Hook0 documentation](https://documentation.hook0.com/) — self-host
- [Stripe webhooks docs](https://docs.stripe.com/webhooks)
- [Hookdeck retry guide](https://hookdeck.com/outpost/guides/outbound-webhook-retry-best-practices)
- [`ADR-0023`](../adr/0023-public-api-developer-platform.md), [`CLI.md`](./CLI.md), [`SANDBOX.md`](./SANDBOX.md), [`SDK.md`](./SDK.md)
