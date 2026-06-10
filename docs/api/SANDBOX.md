# Sandbox + Test Mode

> **[Concept]** Not implemented. The contract below is what `api.afframe.com/v1` ships before public launch.
>
> **No sandbox keys exist today.** No `affk_test_…` key is issued anywhere, and the live
> verifier (`verifyApiKey` in `packages/auth/src/api-key-verifier.ts`) accepts only the
> `affk_live_` prefix — an `affk_test_…` bearer gets a `401 unauthorized`. The public spec
> says so explicitly; do not advertise sandbox keys on any live surface until this ships.

A first-class test environment, Plaid-style. Every signup gets one. No credit card. No separate domain.

---

## 1. How partners enter sandbox

Two switches, both work, both are equivalent:

- **Key prefix**: a key starting `affk_test_…` always lands in sandbox. A `affk_live_…` key always lands in production.
- **No header / no flag** — the prefix decides. We don't accept an `?env=test` query parameter or a header switch. Keys are unforgeable; flags aren't.

There is no separate hostname (`api-sandbox.afframe.com` is **not** a thing). Same `api.afframe.com/v1/*`, different key.

---

## 2. What sandbox is

- A logically-isolated organization on the same production database, gated by `organization.is_test = true`.
- Seeded on signup with realistic fixtures (see §3).
- Wired to the same business logic — same validation, same RLS, same error codes. Bugs surface identically.
- **Not** rate-limit-relaxed. Same 100/60s per key. The point is fidelity, not freedom.
- **Not** charged. Sandbox keys don't count toward billing.

---

## 3. Seeded fixtures

On signup, sandbox org is populated with:

| Resource           | Count | Notes                                                                                                       |
| ------------------ | ----- | ----------------------------------------------------------------------------------------------------------- |
| `organization`     | 1     | "Acme Test s.r.o.", DIČ `CZ12345678`, IČO `12345678`, fiscal year Jan-Dec                                   |
| `bank_account`     | 2     | One Kč (KB `0100`), one EUR (Fio `2010`) — see [`SECRETS.md`](../runbooks/SECRETS.md) for sandbox redaction |
| `account` (chart)  | 50    | Standard CZ small-business chart                                                                            |
| `customer`         | 10    | Mix CZ + EU + non-EU for VAT logic                                                                          |
| `supplier`         | 10    |                                                                                                             |
| `invoice`          | 100   | 60 paid, 30 draft, 10 overdue. Spread across last 12 months.                                                |
| `journal_entry`    | 200   | Posted entries linked to the invoices                                                                       |
| `api_key`          | 1     | `affk_test_…` returned at signup; user copies once                                                          |
| `webhook_endpoint` | 0     | Partner creates their own                                                                                   |

Re-seed available via `POST /v1/sandbox/reset` (returns the org to factory fixtures; existing IDs are NOT preserved).

---

## 4. Force-trigger endpoints

Plaid's killer feature: deterministic error-state and event reproduction. Every concept item below is a `[Concept]` until AFF-71 + webhooks land.

### Errors

```http
POST /v1/sandbox/raise_error
{ "code": "invoice_already_finalized" }
```

The next call against `/v1/invoices/<id>` returns that error, regardless of actual state. One-shot. Lets partners test error handlers without engineering the precondition.

Codes available: every entry in [`ERRORS.md`](./ERRORS.md) §4. CI ensures each registered code is exercisable here.

### Webhook events

```http
POST /v1/sandbox/fire_webhook
{ "type": "invoice.paid", "invoiceId": "inv_01HXY..." }
```

Pushes a canned event to every registered webhook endpoint of the sandbox org. Same signing path, same retry curve, same envelope.

### Bank feed delays

```http
POST /v1/sandbox/bank_feed/lag
{ "ms": 30000 }
```

Next bank-feed sync is delayed by 30 s. Partners test "polling shows stale" UX.

### Reconciliation conflicts

```http
POST /v1/sandbox/journal/force_imbalance
{ "journalId": "j_01HXY...", "delta": "100" }
```

Forces a temporary imbalance that the partner's reconciliation flow must handle.

---

## 5. Test bank codes

CZ-specific. These prefixes are reserved and only valid in sandbox:

| Test bank code                  | Behaviour                                    |
| ------------------------------- | -------------------------------------------- |
| `9999` (sandbox-only fake code) | Always accepts.                              |
| `9998`                          | Returns "account not found" on every lookup. |
| `9997`                          | Random transient failures for 5 s.           |

Real CZ codes (`0100`, `0300`, `0600`, …) work normally in sandbox against fixtures.

---

## 6. Test card numbers + IBANs

We don't process card payments today, so no test PANs. **[Concept]** when payments land, mirror Stripe's `4242 4242 4242 4242` family.

Test IBANs (validated against checksum, fake bank codes):

| IBAN                            | Behaviour           |
| ------------------------------- | ------------------- |
| `CZ65 9999 0000 0000 1234 5670` | Always succeeds     |
| `CZ69 9998 0000 0000 9999 9990` | "account not found" |

---

## 7. Sandbox + production isolation

- `affk_test_…` cannot touch `is_test = false` data. The RLS policy enforces it.
- `affk_live_…` cannot touch `is_test = true` data. Same RLS.
- The admin dashboard surfaces a "TEST MODE" banner whenever you're scoped to a sandbox key.

This is also why we don't accept a header switch: there's no possible misconfiguration that crosses the boundary.

---

## 8. Sandbox is **the** integration target

Partners should not test against `affk_live_…` until they've passed against sandbox. Our launch comms repeat this verbatim. CI for partner integrations (via `@afframe/sdk`) defaults to sandbox unless `AFFRAME_ENV=production` is set.

---

## 9. Limits

- Sandbox keys never expire automatically. Live keys roll on 90 days ([`PUBLIC-LAUNCH.md`](./PUBLIC-LAUNCH.md) §1.7).
- Force-trigger endpoints rate-limit at 60/60s per key — abuse-shield for an external load test.
- `POST /v1/sandbox/reset` rate-limits at 1/60s per key.

---

## 10. References

- [Plaid Sandbox](https://plaid.com/docs/sandbox/) — the model
- [Mercury Sandbox](https://docs.mercury.com/docs/using-mercury-sandbox) — accountancy-specific pattern
- [Stripe test mode](https://docs.stripe.com/test-mode)
- [`ERRORS.md`](./ERRORS.md), [`WEBHOOKS.md`](./WEBHOOKS.md), [`PUBLIC-LAUNCH.md`](./PUBLIC-LAUNCH.md)
