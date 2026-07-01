import "server-only"

import { canAccessSection, lookupStepUp } from "./capabilities"
import { auditAdminAction } from "./admin-audit"
import { requireAdminSession } from "./admin-session"
import { requireStepUp } from "./step-up"
import type { StaffRole } from "./staff-role"

export interface SectionGateResult {
  allowed: boolean
  role: StaffRole
  path: string
}

/**
 * Server-side section gate. Call from every (gated)/<section>/layout.tsx
 * BEFORE rendering children. Returns a verdict so the layout can render
 * either the children or `<AccessDenied />`.
 *
 * Defense-in-depth: every mutating server action that touches a section
 * also calls `requireSection` so a forgotten layout gate doesn't open the
 * action endpoint. The dual call is cheap (one DB roundtrip total — the
 * staff role is read once per request).
 *
 * Audits every denial under `auth.admin.section_denied`.
 */
export async function requireSection(path: string): Promise<SectionGateResult> {
  const ctx = await requireAdminSession()
  const allowed = canAccessSection(ctx.effectiveRole, path)

  if (!allowed) {
    await auditAdminAction({
      action: "auth.admin.section_denied",
      payload: { path, role: ctx.effectiveRole },
    })
    return { allowed, role: ctx.effectiveRole, path }
  }

  // Section access OK — now enforce step-up if this path is marked
  // sensitive. `requireStepUp` redirects on miss (doesn't return). On
  // match, control returns silently and the layout renders children.
  const level = lookupStepUp(path)
  if (level) {
    await requireStepUp(level, path)
  }

  return { allowed, role: ctx.effectiveRole, path }
}
