# @workspace/org-provisioning

The **organization creation-scaffolding protocol** — one callable process that
mints a fully-configured, ready-to-book účetní jednotka (accounting entity).

Composes `@workspace/db` (platform tables + tenancy) and `@workspace/accounting`
(domain master-data). `@workspace/registries` supplies SUGGESTED inputs; the
orchestrator itself performs **no HTTP**.

## The one call

```ts
import { scaffoldOrganization } from "@workspace/org-provisioning"

const result = await scaffoldOrganization({
  // server-injected scope (never from an API request body)
  workspaceId,
  ownerUserId,
  idempotencyKey, // a retry with the same key replays, never duplicates

  // identity
  legalName: "Alfa s.r.o.",
  personKind: "legal_entity",
  legalFormCode: "SRO",
  ico: "12345678",
  dic: "CZ12345678",

  // accounting configuration (regime auto-derived when deterministic)
  vatRegimeCode: "PAYER",
  inPublicRegister: true,

  // period bootstrap
  entityKind: "NEW_ENTITY",
  registeredAt: "2026-03-15",
})
// → { organizationId, slug, periodId, chartId, accountsSeeded, regime,
//     replayed, nextRequiredTasks }
```

## What one call produces (atomic, one transaction)

1. `organization` identity row (+ self-id trigger, owner `organization_membership`)
2. `organization_business_activity` links (NACE codes that exist in the reference)
3. `vat_status` (regime + filing period, time-bound)
4. First `accounting_period` — **regime is stored on the period, not the org**
5. `chart_of_accounts` + the full směrná osnova seeded from `directive_account`
   (double-entry, for-profit only), with `tracks_open_items` preset on the
   saldokonto accounts
6. Default `number_series` (FV / FP / PD / BV / ID + event / asset / inventory)
7. The org's own self-`counterparty` (DIČ / name for KH + SH)
8. Peněžní-deník `category` set (monetary regimes: single-entry + daňová evidence)
9. `organization_provisioning` idempotency + registry-provenance row

## Design (see the advisor gate in the PR)

- **Prefill strictly precedes the write.** `prefillFromRegistries` runs the ARES
  / DPH lookups, a human/agent confirms, and the confirmed values flow in as one
  flat `ScaffoldInput`. Registry-down is a non-event.
- **Regime derivation** is deterministic-only (mandatory double-entry, a single
  allowed regime, or public-register registration forcing double-entry);
  otherwise the caller must choose. Cross-checks: regime ∈ allowed set;
  single-entry × VAT payer is barred (§1f ZoÚ).
- **Period bounds** distinguish a NEW entity (datum vzniku → short first period)
  from a MIGRATED entity (conversion date); TAX_RECORDS forces the calendar year.
- **Nonprofit double-entry** (Vyhláška 504/2002) is not supported yet — hard
  error rather than seeding the wrong (500/2002) chart.
- **Opening balances** (počáteční stavy / zahajovací rozvaha) are user-supplied
  and returned as a `nextRequiredTasks` item, not auto-created.

## Callers

- `apps/web` onboarding (platform) — can replace its inline org seed.
- The create-org wizard (UI).
- `POST /v1/organizations` + an MCP tool — **blocked** until workspace-scoped API
  keys exist (`api_key.organization_id` is `NOT NULL`, so no existing key can
  authorize creating an org that does not exist yet).
