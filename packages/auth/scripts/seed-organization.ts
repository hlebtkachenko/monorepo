#!/usr/bin/env tsx
/**
 * Dev CLI — seed an organization in a workspace. No org-creation UI
 * exists yet (deferred per the locked plan); this script is the only
 * way to materialize an org so invite tokens can be issued against it.
 *
 * Usage:
 *   pnpm tsx packages/auth/scripts/seed-organization.ts \
 *     --workspace <workspace-id-uuid> \
 *     --slug <kebab-case-slug> \
 *     --legal-name "Legal Name S.r.o." \
 *     [--person-kind legal_entity|natural_person] \
 *     [--legal-subject-kind for_profit|non_profit|public]
 *
 * Hits the DB directly via withAdminBypass to bypass RLS during seed.
 * Prints the new organization id on success — feed that into the
 * issue-invite-token.ts script's `--org` flag.
 */
import { eq, sql, withAdminBypass } from "@workspace/db"
import { organization, workspace } from "@workspace/db/schema"

interface Args {
  workspaceId: string
  slug: string
  legalName: string
  personKind: "legal_entity" | "natural_person"
  legalSubjectKind: "for_profit" | "non_profit" | "public" | null
}

function parseArgs(argv: string[]): Args {
  const get = (flag: string): string | undefined => {
    const i = argv.indexOf(flag)
    return i >= 0 ? argv[i + 1] : undefined
  }

  const workspaceId = get("--workspace")
  const slug = get("--slug")
  const legalName = get("--legal-name")
  const personKind = (get("--person-kind") ?? "legal_entity") as
    | "legal_entity"
    | "natural_person"
  const legalSubjectKindRaw = get("--legal-subject-kind") ?? "for_profit"

  if (!workspaceId) throw new Error("--workspace is required")
  if (!slug) throw new Error("--slug is required")
  if (!legalName) throw new Error("--legal-name is required")
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      workspaceId,
    )
  ) {
    throw new Error(`--workspace "${workspaceId}" is not a valid UUID`)
  }
  if (!/^[a-z0-9][a-z0-9-]*[a-z0-9]$/.test(slug)) {
    throw new Error(`--slug "${slug}" must be kebab-case`)
  }

  // legal_subject_kind is only meaningful for legal_entity person_kind.
  // (DB constraint: legal_subject_kind NOT NULL when person_kind='legal_entity'.)
  const legalSubjectKind =
    personKind === "legal_entity"
      ? (legalSubjectKindRaw as "for_profit" | "non_profit" | "public")
      : null

  return { workspaceId, slug, legalName, personKind, legalSubjectKind }
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2))

  const result = await withAdminBypass(async (db) => {
    // Sanity: the workspace must exist.
    const [ws] = await db
      .select({ id: workspace.id, display_name: workspace.display_name })
      .from(workspace)
      .where(eq(workspace.id, args.workspaceId))
      .limit(1)
    if (!ws) {
      throw new Error(`Workspace ${args.workspaceId} not found`)
    }

    const [inserted] = await db
      .insert(organization)
      .values({
        workspace_id: args.workspaceId,
        slug: args.slug,
        legal_name: args.legalName,
        person_kind: args.personKind,
        legal_subject_kind: args.legalSubjectKind,
      })
      .returning()
    if (!inserted) {
      throw new Error("Organization insert returned no row")
    }

    // Trigger requires organization_id = id (the row's own id). Backfill.
    await db.execute(
      sql`UPDATE organization SET organization_id = id WHERE id = ${inserted.id}::uuid`,
    )

    return { ...inserted, workspace_name: ws.display_name }
  })

  console.log("")
  console.log("Organization seeded:")
  console.log("  id:             ", result.id)
  console.log("  slug:           ", result.slug)
  console.log("  legal_name:     ", result.legal_name)
  console.log("  workspace_id:   ", result.workspace_id)
  console.log("  workspace_name: ", result.workspace_name)
  console.log("")
  console.log("Next step — issue invites:")
  console.log(
    `  pnpm tsx packages/auth/scripts/issue-invite-token.ts --email teammate@example.com --org ${result.id} --role member`,
  )
  console.log("")
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err instanceof Error ? err.message : String(err))
    process.exit(1)
  })
