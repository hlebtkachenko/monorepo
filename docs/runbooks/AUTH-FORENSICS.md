# Auth forensics — querying `auth_token` + `audit_event`

Every in-flight authentication artifact (signup token, invite, login-email,
onboarding state, active-workspace cookie) is a row in `auth_token` (ADR-0022).
Each row records `status` (`pending` / `consumed` / `revoked` / `expired`),
`issued_at`, `issued_to_ip` (truncated to /24 or /48), `issued_user_agent_hash`,
`issued_to_user_id`, `consumed_at`, `consumed_from_ip`, `consumed_user_agent_hash`,
`expires_at`, and a JSON `payload` carrying the kind-specific claims (email,
organizationId, role, etc.). Authentication outcomes — `auth.login.*`,
`auth.mfa.*`, `auth.signup.*`, `auth.magic_link.*`, `auth.password_reset.*`,
plus admin-gate decisions — land in `audit_event` (workspace-tier, written
through the Better Auth `hooks.after` adapter; see [ADR-0011](../adr/0011-audit-event.md)).
Together they cover every question an operator asks during an incident:
"who attempted this", "from where", "did it succeed", "is this invite still
live".

## Example query — failed login attempts followed by success

The pattern below joins the two tables on a timestamp window and user id.
Replace `'user@example.com'` with the address you're investigating; tune
`interval '24 hours'` to the window you care about.

```sql
WITH target_user AS (
  SELECT id, email
    FROM app_user
   WHERE email = 'user@example.com'
)
SELECT
  ev.occurred_at,
  ev.action,
  ev.outcome,
  ev.ip_address,
  ev.user_agent_family,
  at.kind            AS token_kind,
  at.status          AS token_status,
  at.issued_to_ip    AS token_issued_ip,
  at.consumed_from_ip AS token_consumed_ip
FROM audit_event ev
LEFT JOIN auth_token at
       ON at.issued_to_user_id = ev.actor_user_id
      AND at.kind = 'lem'
      AND at.issued_at BETWEEN ev.occurred_at - interval '5 minutes'
                            AND ev.occurred_at + interval '5 minutes'
WHERE ev.actor_user_id = (SELECT id FROM target_user)
  AND ev.action LIKE 'auth.login.%'
  AND ev.occurred_at > now() - interval '24 hours'
ORDER BY ev.occurred_at;
```

## Example query — pre-account auth events (enumeration probes)

`audit_event.workspace_id` is NULLABLE since migration 0021 (AFF-208).
Pre-account events — failed login of an unknown email, signup probe
against an already-taken address, magic-link send/consume failures
before any session exists — land with `workspace_id = NULL` and are
invisible to every tenant-bound `app_user` connection (the RLS policies
require `workspace_id IS NOT NULL`). Only `withAdminBypass` and the
bastion `app_owner` session see them. Run the following from the bastion
to spot enumeration / brute-force probes:

```sql
SELECT
  created_at,
  action,
  payload->>'reason'   AS reason,
  payload->>'ip_24'    AS ip_24,
  payload->>'ua_hash'  AS ua_hash
FROM audit_event
WHERE workspace_id IS NULL
  AND created_at > now() - interval '24 hours'
ORDER BY created_at DESC
LIMIT 200;
```

Cluster by `ip_24` + `ua_hash` to find the busiest probe origins. Cross-
reference with `auth_token` rows of `kind='lem'` to see which probed
emails actually triggered a magic-link send.

## How to run

No bastion exists. For production, use Drizzle Studio against
`DATABASE_DIRECT_URL` or run a one-off ECS task; connect as `app_owner`
so RLS does not gate the read.
For local dev, `pnpm --filter @workspace/db studio` opens a Drizzle
Studio session against `DATABASE_DIRECT_URL`. Both `auth_token` and
`audit_event` are global / workspace-scoped — leave the
`app.organization_id` GUC unset so the SELECT spans every tenant. The
bastion session is read-only by convention; flip status columns only
via the documented mutation paths (`revokeToken`, `expireDueAuthTokens`,
`/admin` actions) — never with a raw UPDATE.
