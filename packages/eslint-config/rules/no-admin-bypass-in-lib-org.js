/**
 * workspace-rls/no-admin-bypass-in-lib-org
 *
 * Bans `withAdminBypass(...)` inside `apps/web/lib/org/**` so future org-scoped
 * reads are forced onto `withOrgReadonly()` / `withOrganization()` — which bind
 * the org GUCs and let FORCE RLS be the tenant boundary — instead of silently
 * escaping RLS with the BYPASSRLS admin role.
 *
 * A handful of reads in this directory are genuinely cross-scope and cannot run
 * under a single-org GUC bind (a cross-workspace slug→org lookup that precedes
 * any org id, a cross-workspace org-switcher list, a global app_user identity
 * read). Each such call is explicitly allowlisted with a marker comment on the
 * call line or the line directly above it:
 *
 *   // rls-allow-admin-bypass: <why this read is genuinely cross-scope>
 *   return await withAdminBypass(async (db) => ...)
 *
 * The marker (not a broad file/function allowlist) keeps the exemption per call
 * and self-documenting: a NEW unmarked `withAdminBypass` anywhere under
 * `apps/web/lib/org/` — even in a file that already has an allowlisted one — is
 * flagged.
 *
 * The rule only governs `apps/web/lib/org/**`; it no-ops on every other file, so
 * it is safe to wire under a broad `**\/*.{ts,tsx}` glob.
 *
 * ESM rule (flat config). No CJS wrapper.
 */

const LIB_ORG_SEGMENT = "/apps/web/lib/org/"
const ALLOW_MARKER = "rls-allow-admin-bypass"
const BANNED_CALLEE = "withAdminBypass"

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Ban withAdminBypass in apps/web/lib/org/** (org-scoped reads must use withOrgReadonly()/withOrganization()); genuinely cross-scope reads opt out with a `rls-allow-admin-bypass` marker comment.",
      recommended: true,
    },
    schema: [],
    messages: {
      banned:
        "withAdminBypass is banned in apps/web/lib/org — org-scoped reads must use withOrgReadonly()/withOrganization() so FORCE RLS is the tenant boundary. " +
        "If this read is genuinely cross-scope (cross-workspace lookup, global identity), annotate the call with a `// rls-allow-admin-bypass: <reason>` marker.",
    },
  },

  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(
      /\\/g,
      "/",
    )
    if (!filename.includes(LIB_ORG_SEGMENT)) return {}

    const sourceCode = context.sourceCode ?? context.getSourceCode()

    // Lines covered by an allow-marker comment (whole span, so multi-line block
    // comments count on every line they occupy).
    const markerLines = new Set()
    for (const comment of sourceCode.getAllComments()) {
      if (!comment.value.includes(ALLOW_MARKER)) continue
      for (let l = comment.loc.start.line; l <= comment.loc.end.line; l++) {
        markerLines.add(l)
      }
    }

    return {
      CallExpression(node) {
        if (node.callee.type !== "Identifier") return
        if (node.callee.name !== BANNED_CALLEE) return
        const line = node.callee.loc.start.line
        // Exempt when a marker sits inline (same line) or directly above.
        if (markerLines.has(line) || markerLines.has(line - 1)) return
        context.report({ node, messageId: "banned" })
      },
    }
  },
}
