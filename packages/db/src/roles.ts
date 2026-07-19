import { organizationRole } from "./schema/_enums"

/**
 * Union of `organization_role` values, derived from the pgEnum so it can never
 * drift from the DB type. Distinct from the 3-value `workspace_role`
 * (`owner | admin | member`).
 *
 * Lives here, not under `schema/`, because it is a derived TypeScript type with
 * no SQL migration of its own — keeping it out of `schema/**` avoids the
 * schema-needs-migration paired-file gate (ADR-0009).
 */
export type OrganizationRole = (typeof organizationRole.enumValues)[number]
