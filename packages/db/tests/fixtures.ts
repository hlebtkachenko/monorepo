/**
 * Test fixtures — shared seed helpers for integration tests.
 *
 * All helpers use the superuser admin client (DATABASE_DIRECT_URL) to bypass
 * RLS and seed data across organization boundaries. Tests then connect as
 * app_user (DATABASE_URL) to verify RLS isolation.
 *
 * Fixture pattern:
 *   - `adminClient()` returns a raw postgres-js client with superuser access
 *   - `seedTwoOrganizations()` creates workspace A + org A + org B under the
 *     same workspace, plus two users, so RLS cross-org leak tests can verify
 *     that org A's data is not visible to org B.
 *
 * Cleanup: each test file is responsible for truncating the tables it touches
 * in afterEach/afterAll. The shared container is reused across test files, so
 * tables are NOT automatically cleared between test files.
 */

import postgres from "postgres"

function getAdminUrl(): string {
  const url = process.env["DATABASE_DIRECT_URL"]
  if (!url)
    throw new Error("DATABASE_DIRECT_URL not set — did globalSetup run?")
  return url
}

function getUserUrl(): string {
  const url = process.env["DATABASE_URL"]
  if (!url) throw new Error("DATABASE_URL not set — did globalSetup run?")
  return url
}

/** Create a superuser (app_owner) postgres-js client. Close it when done. */
export function adminClient(): postgres.Sql {
  return postgres(getAdminUrl(), {
    prepare: false,
    max: 1,
    onnotice: () => {},
  })
}

/** Create an app_user postgres-js client. RLS applies. Close it when done. */
export function userClient(): postgres.Sql {
  return postgres(getUserUrl(), {
    prepare: false,
    max: 1,
    onnotice: () => {},
  })
}

export interface TwoOrganizationSeed {
  workspaceId: string
  orgAId: string
  orgBId: string
  userAId: string
  userBId: string
}

/**
 * Seed two organizations under the same workspace, each with a distinct user.
 * Uses the admin client (superuser) so RLS does not apply during seeding.
 *
 * Returns IDs for use in test assertions.
 */
export async function seedTwoOrganizations(
  sql: postgres.Sql,
): Promise<TwoOrganizationSeed> {
  // Ensure the creator user exists before inserting the workspace
  const [creator] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES ('fixture-creator@test.invalid', 'Fixture Creator', 'user')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  if (!creator) throw new Error("Failed to create fixture creator user")

  // Create a shared workspace
  const [workspace] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id)
    VALUES ('Test Workspace', ${creator.id})
    RETURNING id
  `

  if (!workspace) throw new Error("Failed to create workspace")
  const workspaceId = workspace.id

  // Create user A
  const [userA] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES ('user-a@test.invalid', 'User A', 'user')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  if (!userA) throw new Error("Failed to create user A")

  // Create user B
  const [userB] = await sql<Array<{ id: string }>>`
    INSERT INTO app_user (email, name, role)
    VALUES ('user-b@test.invalid', 'User B', 'user')
    ON CONFLICT (email) DO UPDATE SET name = EXCLUDED.name
    RETURNING id
  `
  if (!userB) throw new Error("Failed to create user B")

  // Create organization A
  // person_kind='legal_entity' requires legal_subject_kind NOT NULL
  // (CONSTRAINT organization_person_subject_consistency in 0003_rls_force.sql)
  const [orgA] = await sql<Array<{ id: string }>>`
    INSERT INTO organization (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
    VALUES (uuidv7(), ${workspaceId}, 'org-a', 'Organization A', 'legal_entity', 'for_profit')
    RETURNING id
  `
  if (!orgA) throw new Error("Failed to create org A")
  const orgAId = orgA.id

  // Fix: organization_id must equal id (enforced by trigger)
  await sql`UPDATE organization SET organization_id = id WHERE id = ${orgAId}::uuid`

  // Create organization B
  const [orgB] = await sql<Array<{ id: string }>>`
    INSERT INTO organization (organization_id, workspace_id, slug, legal_name, person_kind, legal_subject_kind)
    VALUES (uuidv7(), ${workspaceId}, 'org-b', 'Organization B', 'legal_entity', 'for_profit')
    RETURNING id
  `
  if (!orgB) throw new Error("Failed to create org B")
  const orgBId = orgB.id

  await sql`UPDATE organization SET organization_id = id WHERE id = ${orgBId}::uuid`

  return {
    workspaceId,
    orgAId,
    orgBId,
    userAId: userA.id,
    userBId: userB.id,
  }
}

/**
 * Seed a tool_call_log row for a given organization.
 * Requires admin client (superuser) to bypass RLS during seeding.
 */
export async function seedToolCallLog(
  sql: postgres.Sql,
  orgId: string,
): Promise<string> {
  const [row] = await sql<Array<{ id: string }>>`
    INSERT INTO tool_call_log (
      organization_id, tool_name, idempotency_key, actor_kind, input_json
    )
    VALUES (
      ${orgId}::uuid,
      'test_tool',
      ${"key-" + Math.random().toString(36).slice(2)},
      'human',
      '{"test": true}'::jsonb
    )
    RETURNING id
  `
  if (!row) throw new Error("Failed to seed tool_call_log")
  return row.id
}

/**
 * Delete all test data in the correct FK order (child before parent).
 *
 * tool_call_log and audit_event are append-only: BEFORE TRUNCATE triggers
 * block TRUNCATE unconditionally, and BEFORE DELETE row triggers block DELETE
 * unconditionally (Layer 2 enforcement). The only admin-side escape hatch is
 * `SET LOCAL session_replication_role = replica`, which disables BEFORE
 * triggers for the duration of the transaction without altering the schema.
 * This is the standard PostgreSQL pattern for admin-side bulk cleanup in test
 * environments; it must never be used in application code paths.
 *
 * Tables without block triggers use plain DELETE to preserve FK ordering.
 */
export async function truncateAll(sql: postgres.Sql): Promise<void> {
  await sql.begin(async (tx) => {
    // Disable BEFORE triggers for the duration of this transaction so that
    // append-only row + statement triggers on tool_call_log and audit_event
    // do not block the cleanup DELETEs.
    await tx.unsafe(`SET LOCAL session_replication_role = replica`)

    // Child tables first (FK order), then parents.
    // auth_invite → workspace; organization_membership → organization, app_user;
    // workspace_membership → workspace, app_user; tool_call_log / audit_event
    // are append-only (handled via session_replication_role above).
    await tx.unsafe(`DELETE FROM auth_invite`)
    await tx.unsafe(`DELETE FROM tool_call_log`)
    await tx.unsafe(`DELETE FROM audit_event`)
    await tx.unsafe(`DELETE FROM organization_membership`)
    await tx.unsafe(`DELETE FROM workspace_membership`)
    await tx.unsafe(`DELETE FROM organization`)
    await tx.unsafe(`DELETE FROM workspace`)
    await tx.unsafe(`DELETE FROM app_user`)

    // session_replication_role is LOCAL to this transaction; it reverts to
    // 'origin' automatically on COMMIT/ROLLBACK — no explicit restore needed.
  })
}
