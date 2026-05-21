# Versioning + Deprecation Policy

> Public contract for how `api.afframe.com/v1` evolves. Mix of **[Live]** (URL-path versioning) and **[Concept]** (deprecation headers, parallel `/vN`).

---

## 1. Versioning scheme

**URL-path** (`/v1`, `/v2`, …). Not header-based. Not date-pinned. Right-sized for single-engineer maintenance — see [`ADR-0023`](../adr/0023-public-api-developer-platform.md) §11.

```
https://api.afframe.com/v1/invoices
https://api.afframe.com/v2/invoices    # ships only when a breaking change requires
```

---

## 2. What counts as breaking

A change is **breaking** (requires `/v2`) if any of:

- Removing or renaming an endpoint, parameter, or response field.
- Changing a parameter / field type (`string` → `number`, optional → required).
- Tightening validation in a way that rejects previously-accepted requests.
- Changing the semantic of an error code (a `code` value's meaning).
- Changing auth semantics (e.g., requiring a new scope on an existing endpoint).
- Removing an enum value from a response that clients switch on.

A change is **non-breaking** (ships on the current `/vN`):

- Adding a new endpoint.
- Adding an optional request parameter.
- Adding a response field.
- Adding an enum value to a request input.
- Adding an error code (clients must already handle unknown codes — Standard Webhooks / Plaid pattern).
- Loosening validation.

When in doubt: ship on `/vN` if the most pessimistic existing client survives.

---

## 3. Deprecation signalling

When an endpoint or field is going away, the server emits these response headers per [RFC 8594](https://www.rfc-editor.org/rfc/rfc8594.html) + [IETF Deprecation draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-deprecation-header/):

```http
Deprecation: @1735689600
Sunset: Wed, 01 Jan 2027 00:00:00 GMT
Link: <https://api.afframe.com/docs/migrations/v1-to-v2>; rel="deprecation"
```

> **[Concept]** The `Link` header migration URL (`/docs/migrations/v1-to-v2`) is contingent on a future narrative docs surface. Use the Scalar reference at `api.afframe.com/` + changelog entries as the interim migration resource.

- `Deprecation` — Unix timestamp when the deprecation was announced.
- `Sunset` — RFC 7231 date when the endpoint will return `410 Gone`.
- `Link` (rel=`deprecation`) — points to the migration guide.

Field-level deprecation is signalled in OpenAPI:

```yaml
properties:
  legacyField:
    type: string
    deprecated: true
    x-deprecated-since: "2026-05-20"
    x-sunset: "2027-01-01"
    x-replaced-by: "newField"
```

Scalar renders strikethrough on `deprecated: true`.

---

## 4. Timeline rules

| Event                                       | Minimum lead time                                 |
| ------------------------------------------- | ------------------------------------------------- |
| Deprecation announcement → endpoint removal | **6 months**                                      |
| `/vN` ships → `/vN-1` removal               | **12 months** of parallel operation               |
| Field deprecation → field removal           | **6 months**                                      |
| Breaking-bug fix (CVE-class)                | **None** — security wins, changelog entry + email |

Removing earlier than 6 months requires a CVE-class justification documented in the changelog.

---

## 5. Communication

A deprecation must produce all three:

1. **Changelog entry** tagged `deprecated:`.
2. **Deprecation header** on every response from the affected endpoint.
3. **Email** to every API key holder using the endpoint within the last 90 days (admin dashboard, AFF-73).

Removal (the `Sunset` date) repeats steps 1 + 3.

---

## 6. SDK + CLI behaviour

- `@afframe/sdk` reads `Deprecation` / `Sunset` headers and emits a `console.warn` per process per endpoint with the migration link. Disable via `Afframe({ warnOnDeprecation: false })`.
- `afframe` CLI prints a one-line warning to stderr.
- Both surface the `Link rel="deprecation"` migration URL.

---

## 7. After Sunset

Calls to removed endpoints return `410 Gone` with:

```json
{
  "error": {
    "code": "endpoint_sunset",
    "error_type": "NOT_FOUND",
    "message": "GET /v1/legacy_invoices was sunset on 2027-01-01. Use GET /v1/invoices.",
    // [Concept — contingent on future docs surface]
    "documentation_url": "https://api.afframe.com/docs/migrations/v1-to-v2",
    "requestId": "…"
  }
}
```

`410` (not `404`) — partners can branch on it.

---

## 8. SDK semver, separate

`@afframe/sdk` semver is independent of API path version. See [`SDK.md`](./SDK.md) §6 for the matrix.

---

## 9. What we deliberately don't do

- **Date-based versioning** (`Stripe-Version: 2023-10-16`). One-engineer team, accountancy domain that _will_ change with CZ legislation. Path versioning + Sunset headers is right-sized.
- **Header-based versioning** (`Accept: application/vnd.afframe.v2+json`). Adds complexity for partners with no proxy support.
- **Pinning per-account default versions**. Adds combinatorial state. Each path is the version.

---

## 10. References

- [RFC 8594 — Sunset HTTP Header](https://www.rfc-editor.org/rfc/rfc8594.html)
- [IETF Deprecation header draft](https://datatracker.ietf.org/doc/draft-ietf-httpapi-deprecation-header/)
- [Zalando RESTful API guidelines — deprecation](https://github.com/zalando/restful-api-guidelines/blob/main/chapters/deprecation.adoc)
- [Linear deprecations](https://linear.app/developers/deprecations)
- [`ADR-0023`](../adr/0023-public-api-developer-platform.md), [`CHANGELOG.md`](./CHANGELOG.md), [`SDK.md`](./SDK.md)
