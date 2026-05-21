# Rate Limits

> Public contract for throttling on `api.afframe.com/v1`. Mix of **[Live]** behaviour and **[Concept]** launch-ready upgrades.

---

## 1. Live today

- **Per API key**, not per IP. Behind the Cloudflare Tunnel every request shares the sidecar's loopback IP — IP-based throttling would create one global bucket. Source: `apps/api/src/v1/api-key-throttler.guard.ts`.
- **Default**: 100 requests / 60 s window.
- **Storage**: NestJS `ThrottlerModule` in-memory (single Fargate task — see `ADR-0008`).
- **429 response**: empty body, standard NestJS `ThrottlerException`. No `Retry-After` header today.

---

## 2. [Concept] launch-ready

### Response headers on every response

```
RateLimit-Limit: 100
RateLimit-Remaining: 87
RateLimit-Reset: 32
```

Follows the [IETF `draft-ietf-httpapi-ratelimit-headers`](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/) convention (singular `RateLimit-*`, NOT the older `X-RateLimit-*`).

### 429 response shape

```http
HTTP/1.1 429 Too Many Requests
Content-Type: application/json
Retry-After: 32
RateLimit-Limit: 100
RateLimit-Remaining: 0
RateLimit-Reset: 32
```

```json
{
  "error": {
    "code": "rate_limited",
    "error_type": "RATE_LIMITED",
    "message": "Rate limit exceeded for this API key. Retry after 32 seconds.",
    // [Concept — contingent on future docs surface]
    "documentation_url": "https://api.afframe.com/docs/rate-limits",
    "requestId": "ab544b02-…"
  }
}
```

`Retry-After` is seconds (integer). Always > 0.

### Per-route tier overrides

| Route                                        | Limit     | Why                                 |
| -------------------------------------------- | --------- | ----------------------------------- |
| `GET /v1/ping`                               | 600/60s   | Cheap, used as health-probe         |
| `GET /v1/openapi.json`, `GET /v1/docs`       | unlimited | Static, public docs surface         |
| `GET /v1/*` (default)                        | 100/60s   | Standard read                       |
| `POST /v1/*` (default)                       | 50/60s    | Standard write                      |
| `POST /v1/journals/import`                   | 5/60s     | Heavy job; per-import billing later |
| `POST /v1/webhook_endpoints/*/rotate_secret` | 3/300s    | Sensitive                           |

Implemented per-controller via `@Throttle({ default: { ttl: ..., limit: ... } })`.

### Burst behaviour

The standard `ThrottlerModule` is a fixed-window counter. **[Concept]** Swap to a sliding-window or token-bucket variant (e.g., `@nestjs/throttler@6` with `ThrottlerStorageRedisService`) once we run multiple Fargate tasks. Single-task today, in-memory is fine.

---

## 3. Client guidance

Partners should:

1. **Read `RateLimit-Remaining` proactively**. Don't only react to 429.
2. **Respect `Retry-After`** — don't retry sooner.
3. **Jitter retries** — full jitter recommended:
   ```
   sleep = random(0, retryAfterMs * 2 ** attempt)
   ```
4. **Use `Idempotency-Key`** on mutating endpoints so safe retries don't duplicate state ([`IDEMPOTENCY.md`](./IDEMPOTENCY.md)).
5. **Stop after 5 retries** for non-idempotent calls. Surface the failure.

`@afframe/sdk` does items 2-5 automatically with `retries: 2` by default ([`SDK.md`](./SDK.md)). It throws `RateLimitError` if exhausted.

---

## 4. What doesn't count against the limit

- `/api/health` — version-neutral health endpoint, no auth.
- `OPTIONS` preflight (none today — public API is server-to-server).
- Requests rejected before the guard (auth failures, malformed requests).

---

## 5. Observing your own usage

**[Concept]** Partners will see live per-key usage in the admin dashboard (AFF-73). Charts: req/min, req/route, 429 count, rolling 7-day. No real-time API for usage yet.

---

## 6. References

- [IETF RateLimit headers draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-ratelimit-headers/)
- [Stripe Rate Limits](https://docs.stripe.com/rate-limits) — the patterns we're cloning
- Source: `apps/api/src/v1/api-key-throttler.guard.ts`, `apps/api/src/v1/v1.module.ts`
- [`ERRORS.md`](./ERRORS.md), [`IDEMPOTENCY.md`](./IDEMPOTENCY.md), [`PUBLIC-LAUNCH.md`](./PUBLIC-LAUNCH.md)
