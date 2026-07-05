/**
 * OCR-template trust-state writes.
 *
 * `ocr_extraction_template.human_confirmed_at` is the single trust gate the
 * server-side novelty veto reads: while it is NULL the template is UNCONFIRMED
 * and every AGENT extraction derived from it is HELD (`novel_template`, a Tier-3
 * DEFER). Only a HUMAN confirm (`POST /v1/ocr-templates/:id/confirm`) sets it.
 *
 * A HUMAN rejecting a held write whose booking was derived from a template is
 * evidence the template's locators produced a bad extraction, so the reject must
 * UN-confirm the template (drop it back below the trust gate) and stamp
 * `last_reject_at`. That reset lives here, shared by BOTH resolve surfaces (the
 * public `/v1/accounting/held-writes/:id/resolve` reject branch and the web
 * approvals server action) so the two paths can never diverge in what they write.
 */
import { eq, sql } from "drizzle-orm"
import type { OrganizationBoundDb } from "../tenancy"
import { ocr_extraction_template } from "../schema/ocr_extraction_template"

/**
 * Un-confirm the OCR template a rejected held write was derived from:
 * `human_confirmed_at → NULL`, `last_reject_at → now()`. REJECT-ONLY — an
 * approve must NEVER touch a template's trust state.
 *
 * WORKSPACE-scoped: `ocr_extraction_template`'s RLS keys on `app.workspace_id`,
 * which `withOrganization` sets (derived from the org row) on the enclosing tx.
 * The caller MUST be inside that `withOrganization` frame, so a template in
 * another workspace is invisible and the update is an RLS no-op (never a
 * cross-workspace write). A `null`/absent `templateId` (a structured-export
 * write carries none) is a no-op.
 */
export async function unconfirmTemplateOnReject(
  db: OrganizationBoundDb,
  templateId: string | null | undefined,
): Promise<void> {
  if (!templateId) return
  await db
    .update(ocr_extraction_template)
    .set({
      human_confirmed_at: null,
      last_reject_at: sql`now()`,
      updated_at: sql`now()`,
    })
    .where(eq(ocr_extraction_template.id, templateId))
}
