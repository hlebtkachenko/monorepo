/**
 * org-tree/no-cross-org-tree-import
 *
 * The organization UI is being rebuilt in a parallel clean-room tree at
 * `apps/web/app/o/[orgSlug]/` while the legacy tree at
 * `apps/web/app/[orgSlug]/` is frozen and slated for deletion. Three import
 * edges are forbidden:
 *
 *   - new -> old      breaks the guarantee that the frozen tree can be `rm -rf`'d
 *     without breaking the new one (and would let legacy code leak into the
 *     rebuild).
 *   - old -> new      would couple the frozen tree to the rebuild.
 *   - outside -> old  any file in NEITHER tree importing the frozen old tree is
 *     an inbound coupling that would also break `rm -rf app/[orgSlug]/`. This is
 *     the direction that keeps the hand-emptied inbound-consumer list (Track A)
 *     empty: once the domain logic was extracted out of the old tree, nothing
 *     outside may reach back in.
 *
 * This rule is the machine proof of clean deletion: green lint => deleting
 * `app/[orgSlug]/` cannot break `app/o/[orgSlug]/` or any outside consumer.
 *
 * Shared code that both trees may use lives OUTSIDE both trees — `@workspace/*`,
 * `apps/web/lib/*`, `apps/web/app/_components/*`. An outside file importing the
 * NEW tree is fine (the new tree is not frozen); only outside -> old is flagged.
 * The one exemption is `scripts/*`: the structure/nav generators
 * (`gen-structure`, `check-nav`, `check-sitemap`) read the old nav on purpose
 * during coexistence and are re-pointed at the new nav at the flip; they live
 * outside the runtime app, so they are not part of the deletion guarantee.
 *
 * Note: `outside -> old` only BLOCKS CI through a dedicated warning-immune gate
 * (`apps/web` `lint:org-orphan`), because the shared base config downgrades this
 * rule to a warning via `eslint-plugin-only-warn`. See that config for why.
 *
 * See apps/web/app/o/[orgSlug]/README.md.
 *
 * ESM rule (flat config). No CJS wrapper.
 */

import path from "node:path"

const NEW_SEGMENT = "/app/o/[orgSlug]"
const OLD_SEGMENT = "/app/[orgSlug]"

/**
 * True when `base` appears in `p` as a full path segment — followed by `/` (a
 * file inside the tree) or ending the string (a bare-directory import like
 * `@/app/[orgSlug]`). Matching the bare base too closes the escape where a
 * no-trailing-slash import slipped through unclassified; the segment-boundary
 * check keeps siblings like `/app/[orgSlug]-backup` from misclassifying.
 */
function inTree(p, base) {
  let i = p.indexOf(base)
  while (i !== -1) {
    const after = p[i + base.length]
    if (after === undefined || after === "/") return true
    i = p.indexOf(base, i + 1)
  }
  return false
}

/**
 * Classify a forward-slash path into the tree it belongs to, else null.
 * The NEW base is checked first; the two are mutually exclusive
 * (`/app/o/[orgSlug]` never contains `/app/[orgSlug]`).
 */
function treeOf(p) {
  if (inTree(p, NEW_SEGMENT)) return "new"
  if (inTree(p, OLD_SEGMENT)) return "old"
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
      outsideToOld:
        "This file is outside both org trees and must not import the frozen old tree (app/[orgSlug]) — " +
        "that inbound coupling would break its deletion. Import the extracted lib from @workspace/* or apps/web/lib/ instead. " +
        "(scripts/* generators are exempt until the flip.)",
    },
  },

  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(
      /\\/g,
      "/",
    )
    const self = treeOf(filename)
    // A file inside a `scripts/` dir is exempt from the outside->old ban: the
    // structure/nav generators intentionally read the old nav during
    // coexistence (re-pointed at the new nav at the flip) and are not part of
    // the runtime deletion guarantee. Keyed on the IMPORTING file, not the
    // target. Only meaningful when `self === null` (a script is never in a tree).
    const isScript = /(^|\/)scripts\//.test(filename)

    function check(source) {
      if (!source || typeof source.value !== "string") return
      const target = treeOf(resolveSource(source.value, filename))
      if (!target || target === self) return
      if (self === "new" && target === "old") {
        context.report({ node: source, messageId: "newToOld" })
      } else if (self === "old" && target === "new") {
        context.report({ node: source, messageId: "oldToNew" })
      } else if (self === null && target === "old" && !isScript) {
        // Outside -> old: the inbound-coupling gate. An outside -> new import is
        // deliberately NOT reported (the new tree is not frozen).
        context.report({ node: source, messageId: "outsideToOld" })
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
