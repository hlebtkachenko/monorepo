# Idempotency

> **[Concept]** Not implemented. The contract below is what `api.afframe.com/v1` ships before public launch.

Adopts the [IETF `Idempotency-Key`](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header) draft with Stripe's replay semantics.

---

## 1. Rule

- **Required** on every `POST` that mutates money or journal state: `/v1/invoices`, `/v1/journals`, future `/v1/payments`. Missing the header → `400 invalid_request "Idempotency-Key required"`.
- **Accepted but optional** on other mutating routes (`POST /v1/webhook_endpoints`, `POST /v1/api_keys`, etc.).
- **Ignored** on `GET`, `HEAD`, `DELETE`, `PUT` (already idempotent by HTTP semantics).

```http
POST /v1/invoices HTTP/1.1
Authorization: Bearer affk_live_...
Idempotency-Key: 7c9c2c30-7a2d-4d9c-8b9a-1d3f2e6a8b0c
Content-Type: application/json

{ ... }
```

---

## 2. Key shape

- Any UTF-8 string ≤ 255 chars. UUID v4 is the recommended default.
- Generated client-side, never server-side.
- A new logical operation deserves a new key. Don't reuse keys across distinct intents.

---

## 3. Server behaviour

The server keeps an `(idempotency_key, organization_id, route)` cache for **24 hours**.

| Scenario                                                          | Behaviour                                                                                                |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| First request — completes successfully                            | Cache the `(status, body, headers)` for 24h. Return the response.                                        |
| Same key, same route, same payload, within 24h                    | Return the cached response verbatim (including original status). Add `Idempotent-Replayed: true` header. |
| Same key, same route, **different** payload                       | `409 idempotency_key_conflict`.                                                                          |
| Same key, same route, first request still processing              | `409 idempotency_key_in_progress`. Client should retry.                                                  |
| Same key, different route                                         | Treated as different operations. Both succeed.                                                           |
| First request — server-side error 5xx                             | Cache the failure for 24h. Replay returns the same 5xx. Client must choose a new key to retry.           |
| First request — `400 bad_request` because the payload was invalid | NOT cached. Same key with corrected payload succeeds.                                                    |

**Why not cache 4xx?** Client-side errors are usually fixable; cacheing them would force a new key for every typo.

---

## 4. Storage

**[Concept]** Postgres table `idempotency_key`:

```sql
create table idempotency_key (
  key             text       not null,
  organization_id text       not null references organization(id),
  route           text       not null,
  payload_hash    text       not null,  -- sha256 of canonical-JSON of request body
  status          smallint,
  response_body   jsonb,
  response_headers jsonb,
  state           text       not null default 'in_progress',  -- 'in_progress' | 'completed'
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null default now() + interval '24 hours',
  primary key (organization_id, route, key)
);

create index on idempotency_key (expires_at);
```

Purge job runs daily — drops rows where `expires_at < now()`. RLS scoped by `organization_id` (the standard pattern; see [ADR-0010](../adr/0010-multi-tenant-rls.md)).

---

## 5. Client guidance

1. **One key per logical intent.** Reuse across automatic retries; new key on user-initiated retry.
2. **Generate before sending.** Persist if you might crash mid-flight.
3. **Treat `Idempotent-Replayed: true` as success.** The server already processed it.
4. **On `409 idempotency_key_in_progress`** — back off and retry. The previous call hasn't finished.
5. **On `409 idempotency_key_conflict`** — your payload differs. Use a new key.

`@afframe/sdk` today: the SDK does NOT auto-generate a key. Callers pass `Idempotency-Key` directly as a header on the request (`client.POST("/v1/...", { headers: { "idempotency-key": k }, body })`). The retry layer reuses the same header on automatic retries and only retries mutations when the header is present (`packages/sdk/src/client.ts`). Auto-generation + a `replayed` field are possible future SDK additions, not current behavior. The server side (storage/replay of the key) is also not implemented yet — see the [Concept] banner above.

---

## 6. References

- [IETF draft — Idempotency-Key header](https://datatracker.ietf.org/doc/html/draft-ietf-httpapi-idempotency-key-header)
- [Stripe idempotency reference](https://docs.stripe.com/api/idempotent_requests)
- [Stripe idempotency design blog](https://stripe.com/blog/idempotency)
- [`ERRORS.md`](./ERRORS.md), [`RATE-LIMITS.md`](./RATE-LIMITS.md), [`SDK.md`](./SDK.md)
