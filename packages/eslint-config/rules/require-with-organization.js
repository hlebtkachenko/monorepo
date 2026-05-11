/**
 * workspace-rls/require-with-organization
 *
 * Forbids raw `db.transaction|select|insert|update|delete|execute` calls
 * outside `packages/db/src/`. Consumers must go through `withOrganization`,
 * `withWorkspace`, or `withAdminBypass` which set the RLS GUCs before running
 * any query.
 *
 * Tracks imports from `@workspace/db` (and subpath exports like
 * `@workspace/db/client`) so aliased imports cannot bypass the rule:
 *
 *   import { db as client } from '@workspace/db/client'  // tracked
 *   client.select(...)                                    // flagged
 *
 * Files inside `packages/db/src/` are excluded.
 *
 * ESM rule (flat config). No CJS wrapper.
 */

const FORBIDDEN_METHODS = new Set([
  "transaction",
  "select",
  "insert",
  "update",
  "delete",
  "execute",
])

const WATCHED_IMPORT_SPECIFIERS = new Set(["db", "sqlClient", "client"])

const WATCHED_SOURCE_PATTERN = /^@workspace\/db(\/.*)?$/

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Require withOrganization/withWorkspace/withAdminBypass wrappers; forbid raw db.* calls outside packages/db/src/",
      recommended: true,
    },
    schema: [],
    messages: {
      noRawDb:
        "Direct `{{ local }}.{{ method }}(...)` is forbidden outside packages/db/src/. " +
        "Use withOrganization(), withWorkspace(), or withAdminBypass() from @workspace/db.",
    },
  },

  create(context) {
    const filename = context.getFilename()
    if (filename.includes("/packages/db/src/")) {
      return {}
    }

    // Local names bound to a forbidden db import. Populated by ImportDeclaration
    // and consulted by CallExpression.
    const trackedLocals = new Set()

    return {
      ImportDeclaration(node) {
        if (typeof node.source.value !== "string") return
        if (!WATCHED_SOURCE_PATTERN.test(node.source.value)) return

        for (const spec of node.specifiers) {
          if (spec.type !== "ImportSpecifier") continue
          const imported = spec.imported.name
          if (!WATCHED_IMPORT_SPECIFIERS.has(imported)) continue
          // local name (after any `as` rename) is the binding we track
          trackedLocals.add(spec.local.name)
        }
      },

      CallExpression(node) {
        const { callee } = node
        if (callee.type !== "MemberExpression") return
        if (callee.computed) return
        if (callee.property.type !== "Identifier") return

        const method = callee.property.name
        if (!FORBIDDEN_METHODS.has(method)) return

        const obj = callee.object
        if (obj.type !== "Identifier") return

        // Match if (a) name matches the legacy heuristic OR (b) the local was
        // imported from @workspace/db. (a) is kept as a safety net for ad-hoc
        // `db` bindings created without an import (e.g., spread out of a tuple).
        const matchesHeuristic =
          obj.name === "db" || obj.name.endsWith("Db") || obj.name === "sqlClient"
        const isTrackedImport = trackedLocals.has(obj.name)
        if (!matchesHeuristic && !isTrackedImport) return

        context.report({
          node,
          messageId: "noRawDb",
          data: { local: obj.name, method },
        })
      },
    }
  },
}
