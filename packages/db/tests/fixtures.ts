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
 * Result of `signUp` — the minimal shape `seedWorkspaceWithOwner` needs back
 * from a Better Auth `signUpEmail` call. Better Auth's response is wider; only
 * the new user's id is consumed here.
 */
export interface SeedSignUpResult {
  userId: string
}

/**
 * Callback that creates a genuine Better Auth email/password credential.
 *
 * `packages/db` must not import `@workspace/auth` (that would invert the
 * `auth -> db` dependency and form a cycle). Instead the caller injects this
 * function — it wraps `auth.api.signUpEmail`, which writes the `app_user` row
 * AND the `auth_account` row carrying the correctly hashed password. Hand-
 * hashing a password here would couple this fixture to Better Auth's internal
 * hash format; driving the real sign-up API is the robust path.
 *
 * `@workspace/auth/test-support` exports `betterAuthSignUp`, the canonical
 * implementation of this callback.
 */
export type SeedSignUp = (input: {
  email: string
  password: string
  name: string
}) => Promise<SeedSignUpResult>

export interface WorkspaceWithOwnerSeed {
  /** Credentials a test/E2E run can sign in with. */
  email: string
  password: string
  /** Seeded identifiers. */
  userId: string
  workspaceId: string
  workspaceMembershipId: string
  organizationId: string
  organizationMembershipId: string
}

export interface SeedWorkspaceWithOwnerOptions {
  /** Required: wraps `auth.api.signUpEmail` (see `SeedSignUp`). */
  signUp: SeedSignUp
  /** Login email. Default: a deterministic unique address. */
  email?: string
  /** Login password. Must satisfy Better Auth's 12-char minimum. */
  password?: string
  /** Owner display name. Default: "E2E Owner". */
  name?: string
}

/**
 * Seed a fully loginable workspace owner: a real Better Auth credential plus
 * the multi-tenant rows (`workspace`, owner `workspace_membership`, one
 * `organization`, owner `organization_membership`).
 *
 * Two-step construction:
 *
 *   1. `signUp(...)` drives Better Auth's own sign-up API. Better Auth writes
 *      the `app_user` identity row and the `auth_account` row holding the
 *      hashed password (provider_id = 'credential'). This is the ONLY way to
 *      get a credential whose hash Better Auth will accept at sign-in.
 *   2. The admin (superuser) `sql` client writes the tenant rows. The owner
 *      `workspace_membership` INSERT is gated by the last-owner-demotion
 *      trigger, which rejects owner inserts from the `app_user` role — so the
 *      INSERT runs under `SET LOCAL ROLE app_admin` with the
 *      `app.app_user_role_name` GUC set, mirroring `withAdminBypass` (the path
 *      apps/web's owner-onboarding action takes).
 *
 * Returns the credentials and every seeded id so a caller can both sign in and
 * assert against the tenant graph.
 */
export async function seedWorkspaceWithOwner(
  sql: postgres.Sql,
  options: SeedWorkspaceWithOwnerOptions,
): Promise<WorkspaceWithOwnerSeed> {
  const email =
    options.email ??
    `e2e-owner-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@test.invalid`
  // Better Auth's emailAndPassword.minPasswordLength is 12 (see auth/server.ts).
  const password = options.password ?? "E2eOwnerPassw0rd!"
  const name = options.name ?? "E2E Owner"

  // Step 1 — create the genuine Better Auth credential.
  const { userId } = await options.signUp({ email, password, name })

  // Step 2 — tenant graph. The owner is the workspace creator.
  const [workspace] = await sql<Array<{ id: string }>>`
    INSERT INTO workspace (display_name, created_by_user_id, contact_email)
    VALUES ('E2E Workspace', ${userId}::uuid, ${email})
    RETURNING id
  `
  if (!workspace)
    throw new Error("seedWorkspaceWithOwner: workspace insert failed")
  const workspaceId = workspace.id

  // Owner workspace_membership: the last-owner-demotion trigger rejects owner
  // INSERTs from app_user, so elevate to app_admin + set the GUC for the
  // duration of this transaction (same contract as withAdminBypass).
  const workspaceMembershipId = await sql.begin(async (tx) => {
    await tx.unsafe(`SET LOCAL ROLE app_admin`)
    await tx.unsafe(`SET LOCAL app.app_user_role_name = 'app_user'`)
    const rows = (await tx.unsafe(
      `INSERT INTO workspace_membership (workspace_id, user_id, role)
       VALUES ('${workspaceId}'::uuid, '${userId}'::uuid, 'owner')
       RETURNING id`,
    )) as unknown as Array<{ id: string }>
    if (!rows[0])
      throw new Error("seedWorkspaceWithOwner: membership insert failed")
    return rows[0].id
  })

  // One organization under the workspace. organization_id must equal id
  // (enforced by trigger) — backfill after insert.
  const [organization] = await sql<Array<{ id: string }>>`
    INSERT INTO organization (
      organization_id, workspace_id, slug, legal_name,
      person_kind, legal_subject_kind
    )
    VALUES (
      uuidv7(), ${workspaceId}::uuid, 'e2e-org', 'E2E Organization',
      'legal_entity', 'for_profit'
    )
    RETURNING id
  `
  if (!organization)
    throw new Error("seedWorkspaceWithOwner: organization insert failed")
  const organizationId = organization.id
  await sql`UPDATE organization SET organization_id = id WHERE id = ${organizationId}::uuid`

  // Owner organization_membership, linked to the workspace_membership row.
  const [orgMembership] = await sql<Array<{ id: string }>>`
    INSERT INTO organization_membership (
      organization_id, workspace_id, user_id,
      workspace_membership_id, role
    )
    VALUES (
      ${organizationId}::uuid, ${workspaceId}::uuid, ${userId}::uuid,
      ${workspaceMembershipId}::uuid, 'owner'
    )
    RETURNING id
  `
  if (!orgMembership)
    throw new Error(
      "seedWorkspaceWithOwner: organization_membership insert failed",
    )

  return {
    email,
    password,
    userId,
    workspaceId,
    workspaceMembershipId,
    organizationId,
    organizationMembershipId: orgMembership.id,
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
    //
    // auth_account / auth_session / auth_verification → app_user. They are
    // declared ON DELETE CASCADE, but session_replication_role = replica also
    // disables FK-driven cascades, so they must be deleted explicitly here or
    // they would be orphaned (and a future app_user delete would not cascade).
    await tx.unsafe(`DELETE FROM auth_invite`)
    await tx.unsafe(`DELETE FROM auth_token`)
    await tx.unsafe(`DELETE FROM tool_call_log`)
    await tx.unsafe(`DELETE FROM audit_event`)
    await tx.unsafe(`DELETE FROM organization_membership`)
    await tx.unsafe(`DELETE FROM workspace_membership`)
    await tx.unsafe(`DELETE FROM organization`)
    await tx.unsafe(`DELETE FROM workspace`)
    await tx.unsafe(`DELETE FROM auth_account`)
    await tx.unsafe(`DELETE FROM auth_session`)
    await tx.unsafe(`DELETE FROM auth_verification`)
    await tx.unsafe(`DELETE FROM app_user`)

    // session_replication_role is LOCAL to this transaction; it reverts to
    // 'origin' automatically on COMMIT/ROLLBACK — no explicit restore needed.
  })
}
