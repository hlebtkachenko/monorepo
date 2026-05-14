/**
 * permissions-drain lane — consumes permissions_outbox rows and writes
 * OpenFGA tuples (ADR-0018 L2).
 *
 * Drain pattern (one batch per pg-boss tick):
 *   1. SELECT ... FOR UPDATE SKIP LOCKED N rows where processed_at IS NULL
 *      AND failed_at IS NULL (skip the dead-letter set).
 *   2. Transform payload jsonb -> OpenFGA tuple write/delete via the SDK.
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
 * PAYLOAD shape (ADR-0018):
 *   {
 *     "op": "write" | "delete",
 *     "object": "resource_type:id",     // OpenFGA object ref
 *     "relation": "viewer"|"editor"|"owner"|... ,
 *     "user": "user:user_id",           // OpenFGA user ref
 *     "subject_id": "<uuid>",           // db CHECK constraint
 *     "condition"?: { name, context? }, // optional ABAC condition
 *   }
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

export const PERMISSIONS_DRAIN_LANE_NAME = "permissions-drain"

const BATCH_SIZE = 50
const MAX_ATTEMPTS = 5

type OutboxRow = {
  id: string
  payload: DrainPayload
  attempts: number
}

interface DrainPayload {
  op: "write" | "delete"
  object: string
  relation: string
  user: string
  subject_id: string
  condition?: { name: string; context?: Record<string, unknown> }
}

function assertPayload(value: unknown): asserts value is DrainPayload {
  if (typeof value !== "object" || value === null) {
    throw new Error("permissions_outbox.payload must be an object")
  }
  const p = value as Record<string, unknown>
  if (p["op"] !== "write" && p["op"] !== "delete") {
    throw new Error(`permissions_outbox.payload.op invalid: ${String(p["op"])}`)
  }
  for (const key of ["object", "relation", "user", "subject_id"] as const) {
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
        SELECT id, payload, attempts
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
        assertPayload(row.payload)
        await applyTuple(deps.client, row.payload)
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
        if (finalFail) failed++
      }
    }

    return { processed, failed }
  })
}

async function applyTuple(
  client: OpenFgaClient,
  payload: DrainPayload,
): Promise<void> {
  const tuple = {
    user: payload.user,
    relation: payload.relation,
    object: payload.object,
    ...(payload.condition && { condition: payload.condition }),
  }

  if (payload.op === "write") {
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
    await drainBatch({ client, now: () => new Date() })
  },
}

registerLane(lane)
