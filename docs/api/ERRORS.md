# Error Envelope + Code Registry

> Public-facing rules for how `api.afframe.com/v1` reports errors. Mix of **[Live]** behaviour (`DomainExceptionFilter`) and **[Concept]** Plaid-shape extension planned before public launch.
>
> **2026-05-21 note:** `documentation_url` was emitted in earlier
> envelopes pointing at `api.afframe.com/docs/errors#<code>`. That
> surface never existed and was archived alongside `apps/docs`; the
> field is no longer emitted by `DomainExceptionFilter`. It remains
> optional on the Plaid envelope schema and the SDK still parses it on
> inbound responses for forward compatibility.

---

## 1. Envelope

### [Live] today

```json
{
  "error": {
    "code": "unauthorized",
    "message": "Missing API key",
    "requestId": "ab544b02-…"
  }
}
```

Produced by `apps/api/src/v1/domain-exception.filter.ts`. `requestId` echoes the `X-Request-Id` response header.

### [Concept] launch-ready

Backwards-compatible extension that adopts Plaid's richer shape:

```json
{
  "error": {
    "code": "invoice_already_finalized",
    "error_type": "INVALID_REQUEST",
    "message": "Invoice is already in state 'finalized' and cannot be edited.",
    "display_message": "This invoice has been finalized. Create a credit note to amend it.",
    "requestId": "ab544b02-…"
  }
}
```

- `code` (snake_case) — stable identifier. Never changes meaning. Renames go through deprecation.
- `error_type` (UPPER_SNAKE) — high-level family. Drives generic UI handling for unknown codes.
- `message` — developer-facing, English, machine-grep-friendly.
- `display_message` — end-user-facing, localizable. Safe to surface verbatim in a partner's UI.
- `documentation_url` — **[Concept — not emitted today]** deep link into the docs Errors page. Anchor matches `code`. Field is optional on the schema; `DomainExceptionFilter` does not emit it until a docs surface exists.
- `requestId` — round-trips with `X-Request-Id`.

Optional `details` array carries field-level breakdown for validation failures:

```json
"details": [
  { "path": "lines[0].amount", "code": "invalid_money_minor_unit", "message": "..." }
]
```

---

## 2. Error families (`error_type`)

| `error_type`               | HTTP | Meaning                                                              | Retry?                     |
| -------------------------- | ---- | -------------------------------------------------------------------- | -------------------------- |
| `VALIDATION`               | 422  | Request shape ok, content invalid                                    | No (fix and resend)        |
| `INVALID_REQUEST`          | 400  | Request shape invalid                                                | No                         |
| `UNAUTHORIZED`             | 401  | Missing / invalid / expired API key                                  | No (re-auth)               |
| `FORBIDDEN`                | 403  | Authn ok, authz denied                                               | No                         |
| `NOT_FOUND`                | 404  | Resource doesn't exist (or org can't see it)                         | No                         |
| `CONFLICT`                 | 409  | State transition denied (e.g., already finalized; idempotency clash) | Sometimes (re-fetch state) |
| `IDEMPOTENCY_KEY_CONFLICT` | 409  | Same `Idempotency-Key` used with a different payload                 | No (use new key)           |
| `RATE_LIMITED`             | 429  | Throttler tripped                                                    | Yes after `Retry-After`    |
| `PAYLOAD_TOO_LARGE`        | 413  | Body or header size cap                                              | No                         |
| `INTERNAL`                 | 500  | Bug on our side                                                      | Yes (with backoff)         |
| `SERVICE_UNAVAILABLE`      | 503  | Planned/unplanned downtime                                           | Yes (with backoff)         |

The mapping `DomainError` → `error_type` is centralized in `apps/api/src/v1/domain-exception.filter.ts`. Adding a new family requires:

1. New `DomainError` subclass in `packages/shared/src/errors.ts`.
2. Mapping line in the filter.
3. Row in this table.
4. Row in the OpenAPI `Error` schema.

---

## 3. Code registry rules

- `code` is **snake_case**, ≤64 chars, ASCII only.
- `code` is namespaced when ambiguity threatens: `invoice_already_finalized` not `already_finalized`.
- Adding a code is MINOR (additive). Renaming is MAJOR (requires deprecation alias for one major).
- Every code MUST appear in this registry **and** the OpenAPI `Error.code` enum.
- A code MUST be reproducible in the sandbox via `/v1/sandbox/raise_error` (concept) so partners can test their handlers.

---

## 4. Code catalog

### Live today

| code                    | error_type      | HTTP | Note                                   |
| ----------------------- | --------------- | ---- | -------------------------------------- |
| `unauthorized`          | UNAUTHORIZED    | 401  | Missing / invalid bearer               |
| `forbidden`             | FORBIDDEN       | 403  | Authz denied (today: API key inactive) |
| `not_found`             | NOT_FOUND       | 404  |                                        |
| `conflict`              | CONFLICT        | 409  | Generic state conflict                 |
| `validation_failed`     | VALIDATION      | 422  | Zod validation tripped                 |
| `bad_request`           | INVALID_REQUEST | 400  |                                        |
| `internal_server_error` | INTERNAL        | 500  | Stack trace not exposed in production  |

### Concept — added with domain endpoints (AFF-71)

| code                          | error_type               | HTTP | Note                                                        |
| ----------------------------- | ------------------------ | ---- | ----------------------------------------------------------- |
| `invoice_already_finalized`   | CONFLICT                 | 409  |                                                             |
| `invoice_not_in_draft`        | CONFLICT                 | 409  |                                                             |
| `journal_period_closed`       | CONFLICT                 | 409  |                                                             |
| `fx_rate_missing`             | NOT_FOUND                | 404  | No rate on requested date — no auto-substitution (ADR-0013) |
| `idempotency_key_conflict`    | IDEMPOTENCY_KEY_CONFLICT | 409  | Same key, different payload                                 |
| `idempotency_key_in_progress` | CONFLICT                 | 409  | First request still processing                              |
| `rate_limited`                | RATE_LIMITED             | 429  | With `Retry-After`                                          |
| `payload_too_large`           | PAYLOAD_TOO_LARGE        | 413  |                                                             |
| `webhook_signature_invalid`   | UNAUTHORIZED             | 401  | Returned ONLY by `POST /v1/cli/listen` echo verification    |

---

## 5. SDK handling

`@afframe/sdk` exports typed `Error` subclasses ([`SDK.md`](./SDK.md)). The default mapping:

| code                         | SDK class           |
| ---------------------------- | ------------------- |
| `validation_failed`          | `ValidationError`   |
| `rate_limited`               | `RateLimitError`    |
| `unauthorized`               | `UnauthorizedError` |
| `forbidden`                  | `ForbiddenError`    |
| `not_found`                  | `NotFoundError`     |
| `conflict`, `*_conflict`     | `ConflictError`     |
| `internal_server_error`, 5xx | `ServerError`       |
| Unknown / future             | `ApiError` (base)   |

---

## 6. Logging

- Every `4xx` is logged at `warn` with `code`, `error_type`, `requestId`. No body content.
- Every `5xx` is logged at `error` with the full stack server-side, scrubbed in the response.
- Never log secrets. Never log full request bodies.

---

## 7. References

- [Plaid Errors](https://plaid.com/docs/errors/) — the shape we're adopting
- [`API-REFERENCE.md`](./API-REFERENCE.md), [`SDK.md`](./SDK.md), [`IDEMPOTENCY.md`](./IDEMPOTENCY.md)
- Source: `apps/api/src/v1/domain-exception.filter.ts`, `packages/shared/src/errors.ts`
