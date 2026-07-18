/**
 * org-tree/no-cross-org-tree-import
 *
 * The organization UI is being rebuilt in a parallel clean-room tree at
 * `apps/web/app/o/[orgSlug]/` while the legacy tree at
 * `apps/web/app/[orgSlug]/` is frozen and slated for deletion. The two trees
 * MUST NOT import each other:
 *
 *   - new -> old  breaks the guarantee that the frozen tree can be `rm -rf`'d
 *     without breaking the new one (and would let legacy code leak into the
 *     rebuild).
 *   - old -> new  would couple the frozen tree to the rebuild.
 *
 * This rule is the machine proof of clean deletion: green lint => deleting
 * `app/[orgSlug]/` cannot break `app/o/[orgSlug]/`.
 *
 * Shared code that both trees may use lives OUTSIDE both trees — `@workspace/*`,
 * `apps/web/lib/*`, `apps/web/app/_components/*` — and is never flagged. Files
 * that are in neither tree (including the `scripts/*` codegen that intentionally
 * reads the old nav until the flip) are ignored: the rule only governs the two
 * org route trees.
 *
 * See apps/web/app/o/[orgSlug]/README.md.
 *
 * ESM rule (flat config). No CJS wrapper.
 */

import path from "node:path"

const NEW_SEGMENT = "/app/o/[orgSlug]/"
const OLD_SEGMENT = "/app/[orgSlug]/"

/**
 * Classify a forward-slash path into the tree it belongs to, else null.
 * The NEW segment is checked first; the two segments are mutually exclusive
 * (`/app/o/[orgSlug]/` never contains `/app/[orgSlug]/`).
 */
function treeOf(p) {
  if (p.includes(NEW_SEGMENT)) return "new"
  if (p.includes(OLD_SEGMENT)) return "old"
  return null
}

/**
 * Normalize an import source to a path we can classify:
 *   - `@/x`     -> apps/web root alias; prefixed with `/` so the org-tree
 *                  segment match works regardless of the real fs root.
 *   - relative  -> resolved against the importing file's directory.
 *   - bare pkg  -> returned as-is (never contains an org-tree segment).
 */
function resolveSource(source, filename) {
  if (source.startsWith("@/")) {
    return "/" + source.slice(2)
  }
  if (source.startsWith(".")) {
    return path.resolve(path.dirname(filename), source).replace(/\\/g, "/")
  }
  return source
}

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid imports between the frozen old org tree (app/[orgSlug]) and the new one (app/o/[orgSlug]) so the old tree can be deleted without breaking the new one.",
      recommended: true,
    },
    schema: [],
    messages: {
      newToOld:
        "The new org tree (app/o/[orgSlug]) must not import the frozen old tree (app/[orgSlug]). " +
        "Shared code belongs in @workspace/* or apps/web/lib/. See apps/web/app/o/[orgSlug]/README.md.",
      oldToNew:
        "The frozen old org tree (app/[orgSlug]) must not import the new tree (app/o/[orgSlug]).",
    },
  },

  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(
      /\\/g,
      "/",
    )
    const self = treeOf(filename)
    if (!self) return {}

    function check(source) {
      if (!source || typeof source.value !== "string") return
      const target = treeOf(resolveSource(source.value, filename))
      if (!target || target === self) return
      if (self === "new" && target === "old") {
        context.report({ node: source, messageId: "newToOld" })
      } else if (self === "old" && target === "new") {
        context.report({ node: source, messageId: "oldToNew" })
      }
    }

    return {
      ImportDeclaration: (node) => check(node.source),
      ExportNamedDeclaration: (node) => check(node.source),
      ExportAllDeclaration: (node) => check(node.source),
      ImportExpression: (node) =>
        check(node.source?.type === "Literal" ? node.source : null),
    }
  },
}
