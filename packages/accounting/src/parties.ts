/**
 * Party (Adresář) reads — the workspace-shared counterparty joined with this org's
 * relationship overlay, plus its child detail tables.
 *
 * Tenancy: counterparty + its children are WORKSPACE-scoped; party_relationship +
 * open_item are ORG-scoped. Every read runs inside an org-bound tx (withOrganization
 * sets both app.workspace_id and app.organization_id), so RLS auto-scopes each side —
 * no explicit WHERE workspace_id / organization_id. Supplier/customer are NOT stored;
 * they are derived here from open_item.direction (PAYABLE ⇒ supplier, RECEIVABLE ⇒
 * customer). Self-org identity rows (self_of_organization_id) are never parties.
 */
import { sql } from "drizzle-orm"
import type { SQL } from "drizzle-orm"
import { one, rows } from "./sql"
import type { ReadExecutor } from "./sql"

export interface PartyListRow {
  id: string
  name: string | null
  legal_name: string | null
  display_name: string | null
  party_kind_code: string | null
  country_code: string | null
  ico: string | null
  tax_id: string | null
  relationship_type: string | null
  relationship_active: boolean | null
  blocked: boolean | null
  is_supplier: boolean
  is_customer: boolean
  archived_at: string | null
}

export interface PartyRelationshipRow {
  id: string
  organization_id: string
  counterparty_id: string
  relationship_type: string | null
  valid_from: string | null
  valid_to: string | null
  active: boolean
  source: string
  default_currency: string | null
  default_payment_terms: number | null
  default_bank_account_id: string | null
  accounting_profile: unknown
  risk_status: string | null
  blocked: boolean
}

export interface PartyDetail {
  id: string
  name: string | null
  legal_name: string | null
  display_name: string | null
  party_kind_code: string | null
  legal_form_code: string | null
  country_code: string | null
  ico: string | null
  tax_id: string | null
  data_box_id: string | null
  registration_status: string | null
  verification_source: string | null
  last_verified_at: string | null
  archived_at: string | null
  relationship: PartyRelationshipRow | null
  addresses: unknown[]
  contacts: unknown[]
  bank_accounts: unknown[]
  identifiers: unknown[]
}

/**
 * List every party visible to the workspace, with this org's relationship overlay
 * and the derived supplier/customer flags. `filter.activeOnly` hides archived
 * parties; `filter.kind` filters by party_kind_code; `filter.search` matches name /
 * legal_name / IČO / DIČ (case-insensitive).
 */
export function listParties(
  db: ReadExecutor,
  filter: { activeOnly?: boolean; kind?: string; search?: string } = {},
): Promise<PartyListRow[]> {
  const conds: SQL[] = [sql`c.self_of_organization_id IS NULL`]
  if (filter.activeOnly) conds.push(sql`c.archived_at IS NULL`)
  if (filter.kind) conds.push(sql`c.party_kind_code = ${filter.kind}`)
  if (filter.search) {
    const like = `%${filter.search}%`
    conds.push(
      sql`(c.name ILIKE ${like} OR c.legal_name ILIKE ${like} OR c.ico ILIKE ${like} OR c.tax_id ILIKE ${like})`,
    )
  }
  const where = sql`WHERE ${sql.join(conds, sql` AND `)}`
  return rows<PartyListRow>(
    db,
    sql`SELECT c.id,
               c.name,
               c.legal_name,
               c.display_name,
               c.party_kind_code,
               c.country_code,
               c.ico,
               c.tax_id,
               pr.relationship_type,
               pr.active AS relationship_active,
               pr.blocked,
               EXISTS (SELECT 1 FROM open_item oi
                        WHERE oi.counterparty_id = c.id AND oi.direction = 'PAYABLE')    AS is_supplier,
               EXISTS (SELECT 1 FROM open_item oi
                        WHERE oi.counterparty_id = c.id AND oi.direction = 'RECEIVABLE') AS is_customer,
               c.archived_at
          FROM counterparty c
          LEFT JOIN party_relationship pr ON pr.counterparty_id = c.id
          ${where}
          ORDER BY COALESCE(c.display_name, c.name, c.legal_name), c.id`,
  )
}

/**
 * Full detail of one party: identity core + this org's relationship (or null) +
 * the workspace child collections (addresses / contacts / bank accounts /
 * identifiers). Throws if the id is not a visible party.
 */
export function getParty(
  db: ReadExecutor,
  counterpartyId: string,
): Promise<PartyDetail> {
  return one<PartyDetail>(
    db,
    sql`SELECT c.id,
               c.name,
               c.legal_name,
               c.display_name,
               c.party_kind_code,
               c.legal_form_code,
               c.country_code,
               c.ico,
               c.tax_id,
               c.data_box_id,
               c.registration_status,
               c.verification_source,
               c.last_verified_at,
               c.archived_at,
               CASE WHEN pr.id IS NULL THEN NULL ELSE to_jsonb(pr.*) END AS relationship,
               COALESCE((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at)
                           FROM party_address a WHERE a.counterparty_id = c.id), '[]'::jsonb)      AS addresses,
               COALESCE((SELECT jsonb_agg(to_jsonb(ct) ORDER BY ct.created_at)
                           FROM party_contact ct WHERE ct.counterparty_id = c.id), '[]'::jsonb)    AS contacts,
               COALESCE((SELECT jsonb_agg(to_jsonb(b) ORDER BY b.created_at)
                           FROM party_bank_account b WHERE b.counterparty_id = c.id), '[]'::jsonb) AS bank_accounts,
               COALESCE((SELECT jsonb_agg(to_jsonb(i) ORDER BY i.created_at)
                           FROM party_identifier i WHERE i.counterparty_id = c.id), '[]'::jsonb)   AS identifiers
          FROM counterparty c
          LEFT JOIN party_relationship pr ON pr.counterparty_id = c.id
         WHERE c.id = ${counterpartyId}::uuid
           AND c.self_of_organization_id IS NULL`,
  )
}

/** Every party relationship in the current org (for a relationships listing). */
export function listPartyRelationships(
  db: ReadExecutor,
  filter: { activeOnly?: boolean } = {},
): Promise<PartyRelationshipRow[]> {
  const conds: SQL[] = []
  if (filter.activeOnly) conds.push(sql`active = true`)
  const where = conds.length ? sql`WHERE ${sql.join(conds, sql` AND `)}` : sql``
  return rows<PartyRelationshipRow>(
    db,
    sql`SELECT id, organization_id, counterparty_id, relationship_type,
               valid_from, valid_to, active, source, default_currency,
               default_payment_terms, default_bank_account_id, accounting_profile,
               risk_status, blocked
          FROM party_relationship
          ${where}
          ORDER BY created_at`,
  )
}
