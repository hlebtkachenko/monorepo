/**
 * permissions-drain lane — consumes permissions_outbox rows and writes
 * OpenFGA tuples (ADR-0018 L2).
 *
 * Drain pattern (one batch per pg-boss tick):
 *   1. SELECT ... FOR UPDATE SKIP LOCKED N rows where processed_at IS NULL
 *      AND failed_at IS NULL (skip the dead-letter set).
 *   2. Read op_type from the COLUMN (not payload). Transform payload jsonb
 *      into an OpenFGA tuple. Write via the SDK.
 *   3. On success: UPDATE processed_at = now() in the same transaction so
 *      the row releases its lock + commits "done" together.
 *   4. On failure: bump attempts + last_error. After MAX_ATTEMPTS, set
 *      failed_at = now() — drains stop touching the row; an alarm on
 *      failed_at IS NOT NULL count > 0 triggers human triage.
 *
 * permissions_outbox has NO RLS (admin-scope by design). Drain reads across
 * all orgs via withAdminBypass — the workspace-rls/require-with-organization
 * ESLint rule does not apply to admin-scope tables.
 *
 * SCHEMA SHAPE — must match migration 0006_permissions_outbox.sql:
 *
 *   Columns:
 *     id            uuid PK
 *     op_type       text NOT NULL CHECK IN ('write', 'delete')
 *     payload       jsonb NOT NULL (CHECK constraints below)
 *     attempts      int NOT NULL DEFAULT 0
 *     last_error    text
 *     failed_at     timestamptz
 *     processed_at  timestamptz
 *     created_at    timestamptz NOT NULL DEFAULT now()
 *
 *   Payload jsonb (object) MUST contain (DB-enforced):
 *     - "workspace_id" : valid uuid string
 *     - "user"         : matches ^[a-z][a-z0-9_]*:<uuid>$ (OpenFGA user ref,
 *                        e.g. "user:00000000-0000-7000-8000-0000000000aa")
 *
 *   Payload jsonb (object) ADDITIONALLY required by drain (app-level):
 *     - "object"       : OpenFGA object ref ("resource_kind:<uuid>")
 *     - "relation"     : OpenFGA relation name ("viewer", "editor", ...)
 *     - "condition"?   : { name: string, context?: Record<string, unknown> }
 *
 * Idempotency:
 *   - Same OpenFGA write twice = no-op (FGA enforces tuple uniqueness).
 *   - processed_at is set inside the same admin tx as the SELECT FOR
 *     UPDATE, so the row commits "done" or "not done" atomically.
 *   - Crash mid-drain reaps the row at the next batch via lock release.
 */

import { OpenFgaClient } from "@openfga/sdk"
import { sql } from "drizzle-orm"
import { withAdminBypass } from "@workspace/db/tenancy"
import { registerLane, type Lane } from "./registry"
import { notifierFromEnv, sanitizeError } from "@workspace/notify"

export const PERMISSIONS_DRAIN_LANE_NAME = "permissions-drain"

const BATCH_SIZE = 50
const MAX_ATTEMPTS = 5

// Migration 0006 CHECK constraint regex for payload.user.
const USER_REF_RE =
  /^[a-z][a-z0-9_]*:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

// Validator for payload.workspace_id (any valid uuid v1/v3/v4/v5/v7).
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type OpType = "write" | "delete"

type OutboxRow = {
  id: string
  op_type: OpType
  payload: DrainPayload
  attempts: number
}

interface DrainPayload {
  workspace_id: string
  user: string
  object: string
  relation: string
  condition?: { name: string; context?: Record<string, unknown> }
}

function assertOpType(value: unknown): asserts value is OpType {
  if (value !== "write" && value !== "delete") {
    throw new Error(`permissions_outbox.op_type invalid: ${String(value)}`)
  }
}

function assertPayload(value: unknown): asserts value is DrainPayload {
  if (typeof value !== "object" || value === null) {
    throw new Error("permissions_outbox.payload must be an object")
  }
  const p = value as Record<string, unknown>
  if (
    typeof p["workspace_id"] !== "string" ||
    !UUID_RE.test(p["workspace_id"])
  ) {
    throw new Error(
      "permissions_outbox.payload.workspace_id must be a valid uuid string",
    )
  }
  if (typeof p["user"] !== "string" || !USER_REF_RE.test(p["user"])) {
    throw new Error(
      "permissions_outbox.payload.user must match /^[a-z][a-z0-9_]*:<uuid>$/",
    )
  }
  for (const key of ["object", "relation"] as const) {
    if (typeof p[key] !== "string" || (p[key] as string).length === 0) {
      throw new Error(
        `permissions_outbox.payload.${key} must be non-empty string`,
      )
    }
  }
}

interface DrainDeps {
  client: OpenFgaClient
  now: () => Date
  /** Optional: notified once per dead-lettered row (max-attempts). Tests omit it. */
  notify?: (text: string) => void
}

/**
 * Process one batch. Exported so unit tests can drive it with a FakeOpenFga
 * + the existing admin-bypass tx primitive — without booting pg-boss.
 */
export async function drainBatch(deps: DrainDeps): Promise<{
  processed: number
  failed: number
}> {
  return await withAdminBypass(async (tx) => {
    const rows = (await tx.execute<OutboxRow>(
      sql`
        SELECT id, op_type, payload, attempts
        FROM permissions_outbox
        WHERE processed_at IS NULL
          AND failed_at IS NULL
        ORDER BY created_at ASC
        FOR UPDATE SKIP LOCKED
        LIMIT ${BATCH_SIZE}
      `,
    )) as unknown as OutboxRow[]

    let processed = 0
    let failed = 0

    for (const row of rows) {
      try {
        assertOpType(row.op_type)
        assertPayload(row.payload)
        await applyTuple(deps.client, row.op_type, row.payload)
        await tx.execute(sql`
          UPDATE permissions_outbox
          SET processed_at = ${deps.now()}
          WHERE id = ${row.id}::uuid
        `)
        processed++
      } catch (err) {
        const nextAttempts = row.attempts + 1
        const lastError = err instanceof Error ? err.message : String(err)
        const finalFail = nextAttempts >= MAX_ATTEMPTS
        await tx.execute(sql`
          UPDATE permissions_outbox
          SET attempts = ${nextAttempts},
              last_error = ${lastError},
              failed_at = ${finalFail ? deps.now() : null}
          WHERE id = ${row.id}::uuid
        `)
        if (finalFail) {
          failed++
          deps.notify?.(
            `permissions-drain dead-lettered row ${row.id}: ${sanitizeError(err, row.id).message}`,
          )
        }
      }
    }

    return { processed, failed }
  })
}

async function applyTuple(
  client: OpenFgaClient,
  opType: OpType,
  payload: DrainPayload,
): Promise<void> {
  const tuple = {
    user: payload.user,
    relation: payload.relation,
    object: payload.object,
    ...(payload.condition && { condition: payload.condition }),
  }

  if (opType === "write") {
    await client.write({ writes: [tuple] })
  } else {
    await client.write({
      deletes: [
        {
          user: tuple.user,
          relation: tuple.relation,
          object: tuple.object,
        },
      ],
    })
  }
}

function getOpenFgaClient(): OpenFgaClient {
  const apiUrl = process.env["OPENFGA_API_URL"]
  const storeId = process.env["OPENFGA_STORE_ID"]
  const modelId = process.env["OPENFGA_MODEL_ID"]
  if (!apiUrl || !storeId || !modelId) {
    throw new Error(
      "permissions-drain lane requires OPENFGA_API_URL + OPENFGA_STORE_ID + OPENFGA_MODEL_ID. " +
        "Run infra/openfga/bootstrap.mjs to populate the SSM parameters.",
    )
  }
  return new OpenFgaClient({
    apiUrl,
    storeId,
    authorizationModelId: modelId,
  })
}

const lane: Lane = {
  name: PERMISSIONS_DRAIN_LANE_NAME,
  options: {
    // pg-boss batch size — capped by BATCH_SIZE inside drainBatch via LIMIT.
    batchSize: 1,
    // Run every 5 s in the absence of a notify trigger; the outbox INSERT
    // path will also pg_notify('permissions_outbox', '') to wake immediately
    // in a future iteration.
    pollingIntervalSeconds: 5,
  },
  handler: async () => {
    const client = getOpenFgaClient()
    const notifier = notifierFromEnv()
    await drainBatch({
      client,
      now: () => new Date(),
      notify: (text) => void notifier?.alert(text, { source: "worker" }),
    })
  },
}

registerLane(lane)
