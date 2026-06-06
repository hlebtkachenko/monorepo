/**
 * Dev seed — workspace + organization + owner memberships.
 *
 * Idempotent: each insert is a no-op if a matching row already exists.
 *
 * All writes run through `withAdminBypass` so they satisfy FORCE RLS and
 * the `app_prevent_last_owner_demotion` trigger (which fail-closes on an
 * owner `workspace_membership` write unless the admin role + GUC are set).
 * Raw `db.*` inserts are rejected by the trigger with
 * "app_user cannot INSERT an owner workspace_membership row".
 *
 * Pre-condition: a user must exist in `app_user`. Create one via the
 * Better Auth catchall before running this:
 *
 *   curl -X POST http://localhost:3000/api/auth/sign-up/email \
 *     -H 'content-type: application/json' \
 *     -d '{"email":"owner@example.com","password":"passwordpassword","name":"Owner"}'
 *
 * Then pass the email via SEED_OWNER_EMAIL (default `owner@example.com`).
 *
 * Czech accounting SaaS defaults (per lac research, ADR-0001 / D-06 /
 * D-114..D-118):
 *   organization.person_kind             = 'legal_entity'      (s.r.o. workflow)
 *   organization.legal_subject_kind      = 'for_profit'        (required by CHECK)
 *   organization.fiscal_year_start_month = 1                   (calendar year)
 *   workspace_membership.mfa_grace_until = now() + 3650 days   (no active enforcement)
 *   workspace.onboarding_completed_at    = now()               (skip the 5-step wizard)
 *   workspace.beta_plan_acknowledged_at  = now()               (closed-beta gate)
 *
 * Usage:
 *   DATABASE_URL=postgres://... pnpm --filter @workspace/db db:seed
 */
import { eq } from "drizzle-orm"
import {
  app_user,
  organization,
  organization_membership,
  workspace,
  workspace_membership,
} from "../src/schema/index"
import { withAdminBypass } from "../src/tenancy"

async function main(): Promise<void> {
  const email = process.env.SEED_OWNER_EMAIL ?? "owner@example.com"
  const workspaceName = process.env.SEED_WORKSPACE_NAME ?? "Acme Books"
  const orgSlug = process.env.SEED_ORG_SLUG ?? "acme"
  const orgLegalName = process.env.SEED_ORG_LEGAL_NAME ?? "Acme s.r.o."

  await withAdminBypass(async (tx) => {
    const [user] = await tx
      .select({ id: app_user.id, email: app_user.email })
      .from(app_user)
      .where(eq(app_user.email, email))
      .limit(1)
    if (!user) {
      throw new Error(
        `No app_user with email "${email}". Sign up via the Better Auth catchall first, then re-run with SEED_OWNER_EMAIL=<email>.`,
      )
    }

    // Workspace ---------------------------------------------------------
    const [existingWorkspace] = await tx
      .select({ id: workspace.id, display_name: workspace.display_name })
      .from(workspace)
      .where(eq(workspace.created_by_user_id, user.id))
      .limit(1)

    let workspaceId: string
    if (existingWorkspace) {
      workspaceId = existingWorkspace.id
      console.log(
        `workspace exists ${existingWorkspace.display_name} (${workspaceId})`,
      )
    } else {
      const now = new Date()
      const [inserted] = await tx
        .insert(workspace)
        .values({
          display_name: workspaceName,
          contact_email: email,
          created_by_user_id: user.id,
          beta_plan_acknowledged_at: now,
          step_1_completed_at: now,
          step_2_completed_at: now,
          step_3_completed_at: now,
          step_4_completed_at: now,
          step_5_completed_at: now,
          onboarding_completed_at: now,
        })
        .returning({ id: workspace.id })
      if (!inserted) {
        throw new Error("workspace insert returned no row")
      }
      workspaceId = inserted.id
      console.log(`workspace created ${workspaceName} (${workspaceId})`)
    }

    // Workspace membership ----------------------------------------------
    const [existingWsMembership] = await tx
      .select({ id: workspace_membership.id })
      .from(workspace_membership)
      .where(eq(workspace_membership.user_id, user.id))
      .limit(1)

    let wsMembershipId: string
    if (existingWsMembership) {
      wsMembershipId = existingWsMembership.id
      console.log(`workspace_membership exists (${wsMembershipId})`)
    } else {
      // 3650 days ≈ 10 years — per lac 27-03-ONBOARDING-SUMMARY.md, this
      // value marks "no active 2FA enforcement" for dev/enrolled users.
      const tenYearsOut = new Date()
      tenYearsOut.setDate(tenYearsOut.getDate() + 3650)
      const [inserted] = await tx
        .insert(workspace_membership)
        .values({
          workspace_id: workspaceId,
          user_id: user.id,
          role: "owner",
          mfa_grace_until: tenYearsOut,
        })
        .returning({ id: workspace_membership.id })
      if (!inserted) {
        throw new Error("workspace_membership insert returned no row")
      }
      wsMembershipId = inserted.id
      console.log(`workspace_membership created owner (${wsMembershipId})`)
    }

    // Organization ------------------------------------------------------
    const [existingOrg] = await tx
      .select({ id: organization.id, slug: organization.slug })
      .from(organization)
      .where(eq(organization.slug, orgSlug))
      .limit(1)

    let organizationId: string
    if (existingOrg) {
      organizationId = existingOrg.id
      console.log(`organization exists ${existingOrg.slug} (${organizationId})`)
    } else {
      const [inserted] = await tx
        .insert(organization)
        .values({
          workspace_id: workspaceId,
          slug: orgSlug,
          legal_name: orgLegalName,
          // Czech s.r.o. workflow exercises full double-entry surface area.
          person_kind: "legal_entity",
          // Required when person_kind = 'legal_entity' (CHECK constraint).
          legal_subject_kind: "for_profit",
          fiscal_year_start_month: 1,
        })
        .returning({ id: organization.id })
      if (!inserted) {
        throw new Error("organization insert returned no row")
      }
      organizationId = inserted.id
      console.log(`organization created ${orgSlug} (${organizationId})`)
    }

    // Organization membership -------------------------------------------
    const [existingOrgMembership] = await tx
      .select({ id: organization_membership.id })
      .from(organization_membership)
      .where(eq(organization_membership.user_id, user.id))
      .limit(1)

    if (existingOrgMembership) {
      console.log(
        `organization_membership exists (${existingOrgMembership.id})`,
      )
    } else {
      const [inserted] = await tx
        .insert(organization_membership)
        .values({
          organization_id: organizationId,
          workspace_id: workspaceId,
          user_id: user.id,
          workspace_membership_id: wsMembershipId,
          role: "owner",
        })
        .returning({ id: organization_membership.id })
      if (!inserted) {
        throw new Error("organization_membership insert returned no row")
      }
      console.log(`organization_membership created owner (${inserted.id})`)
    }

    console.log("\nseed: done")
    console.log(
      `\n  log in as ${email}, then visit http://localhost:3000/${orgSlug}`,
    )
  })
}

void main()
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
  .finally(() => {
    process.exit(0)
  })
