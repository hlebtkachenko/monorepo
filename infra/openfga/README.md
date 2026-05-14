# OpenFGA — L2 ReBAC Authorization (ADR-0018)

This directory contains the OpenFGA model, test assertions, bootstrap tooling, and local compose overlay for the L2 authorization layer described in [ADR-0018](../../docs/adr/0018-three-layer-authz.md).

## Purpose

L2 handles relationship traversal (does user X have permission Y on resource Z?) and `ListObjects` queries (which invoices can user X see?). It also owns ad-hoc resource sharing (external auditor `viewer` grants) that cannot be expressed in Postgres RLS alone.

Authorization layer order at request time:

1. **L1 (RLS)**: `SET LOCAL app.organization_id` + `app.user_id` — always, ~10 µs.
2. **L3 (Cerbos)**: attribute/action gate via embedded WASM — always for writes, ~10-100 µs.
3. **L2 (OpenFGA)**: graph check + `ListObjects` — for list/share/transfer actions, ~0.5-1 ms localhost HTTP.

## Model

`model.fga` — FGA 1.1 schema. Three-tier hierarchy:

```
workspace (owner | admin | member)
  └─ organization (owner | admin | member | agent | guest)
       └─ resources (account, journal_entry, ledger_entry, invoice,
                     counterparty, bank_account, vat_rate,
                     numerical_series, project, file)
```

Key semantics:

- Workspace admin cascades `can_view` + `can_edit` to child org resources but NOT `can_delete`.
- `guest` gets `can_view_dashboard` only — cascade blocker prevents access to child resources.
- `agent` (AI principal) gets `can_view` + `can_edit` on standard resources but NOT `can_administer` / `can_delete` / `can_manage_members`.
- `journal_entry` and `ledger_entry` have NO `can_delete` relation — immutability enforced at model layer.
- `vat_rate` and `numerical_series` require `can_administer` (admin+) for `can_edit`.
- `invoice` and `file` have an ad-hoc `viewer` relation slot for external auditor shares.

## Local Boot

Requirements: Docker, the base dev compose stack running (postgres service).

```bash
docker compose \
  -f infra/compose/docker-compose.dev.yml \
  -f infra/openfga/docker-compose.openfga.yml \
  --profile auth up -d
```

This starts two containers:
- `openfga-migrate` — one-shot init container that runs `openfga migrate` against Postgres.
- `openfga` — the OpenFGA server on `http://localhost:8080`.

Verify healthy:

```bash
curl -fs http://localhost:8080/healthz
```

## Schema Bootstrap

After the compose stack is running, write the model to the local store:

```bash
node infra/openfga/bootstrap.mjs --env dev
```

The script outputs `OPENFGA_STORE_ID` and `OPENFGA_MODEL_ID`. Copy them to `.env.local`.

## Test Loop

Run model assertions locally (no running server needed — model tests are stateless):

```bash
fga model test --tests "infra/openfga/tests/*.fga.yaml"
```

Validate the model DSL:

```bash
fga model validate --file infra/openfga/model.fga
```

Test files:

| File | Scope |
|------|-------|
| `00-workspace-roles.fga.yaml` | Workspace role grants and denials |
| `01-organization-inheritance.fga.yaml` | Workspace to org cascade semantics |
| `02-resource-grants.fga.yaml` | All 10 resource types x roles x actions matrix |
| `03-agent-action-gates.fga.yaml` | AI principal action gates |
| `04-external-shares.fga.yaml` | Ad-hoc viewer grants on invoice + file |

## Model Versioning

Every call to `writeAuthorizationModel` returns a new `authorization_model_id`. The api reads the active model ID from SSM at runtime:

- Local: `OPENFGA_MODEL_ID` in `.env.local`
- Staging/Prod: SSM at `/monorepo/{env}/openfga/model-id`

Re-running `bootstrap.mjs` is store-safe: the existing store is reused (found by name). But every run writes a fresh authorization model, producing a new `authorization_model_id` and overwriting the SSM `/monorepo/{env}/openfga/model-id` parameter. Old tuples remain valid (OpenFGA preserves tuple compatibility across model versions for additive changes), but **the api must read `OPENFGA_MODEL_ID` from SSM at boot** rather than cache it across deploys — otherwise it will pin to a stale model ID. Commit 9's OpenFGA module follows this contract.

## Production Bootstrap

This is a manual one-time step performed by the operator before the first `cdk deploy App-{env}`:

1. Create the openfga schema in RDS (via temporary bastion tunnel):
   ```sql
   CREATE SCHEMA openfga AUTHORIZATION app_owner;
   ```

2. Run migration:
   ```bash
   openfga migrate \
     --datastore-engine postgres \
     --datastore-uri "postgres://app_owner:<password>@<rds-host>:5432/monorepo?search_path=openfga"
   ```

3. Bootstrap the store and write SSM parameters:
   ```bash
   AWS_REGION=eu-central-1 \
   OPENFGA_API_URL=http://<bastion-forwarded-port>:8080 \
   node infra/openfga/bootstrap.mjs --env staging
   ```

See `docs/runbooks/AWS-DEPLOY.md` for the full bootstrap ceremony.

## Cross-references

- [ADR-0018: Three-layer authz](../../docs/adr/0018-three-layer-authz.md)
- [ADR-0010: Multi-tenant RLS](../../docs/adr/0010-multi-tenant-rls.md)
- [infra/cerbos/](../cerbos/) — L3 Cerbos embedded policies
- [packages/workers/src/lanes/permissions-drain.ts](../../packages/workers/src/lanes/permissions-drain.ts) — outbox drain to FGA
