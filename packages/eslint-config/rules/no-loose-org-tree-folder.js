/**
 * org-tree/no-loose-org-tree-folder
 *
 * Inside the rebuilt org tree (`apps/web/app/o/[orgSlug]/`), the ONLY permitted
 * underscore-prefixed grouping folders are `_shell/` (this tree's chrome,
 * organized to mirror the AppShell anatomy) and `_nav/`. Any other private
 * folder — in particular a flat `_components/`, which is the FROZEN OLD tree's
 * pattern — is forbidden at every depth. Page compositions live under the
 * anatomy, e.g. `_shell/app-body/app-content/content-header/` or
 * `.../content-body/`, never a loose dumping folder.
 *
 * Why a check and not just prose: the placement rule lived only in the README
 * charter, so a contributor (or an agent) following the repo-wide `_components`
 * convention could reintroduce the old-tree shape unnoticed. This rule is the
 * machine proof that the tree's layout matches the charter — it keys off the
 * file PATH (not imports), so it fires on every file placed under a disallowed
 * folder. Green `pnpm --filter web lint:org-new` (`--max-warnings 0`) <=> no
 * loose folders.
 *
 * Governs the NEW tree only (`/app/o/[orgSlug]/`); the old tree is deleted at
 * the flip, so its `_components/` is intentionally not policed here.
 *
 * See apps/web/app/o/[orgSlug]/README.md.
 *
 * ESM rule (flat config). No CJS wrapper.
 */

const MARKER = "/app/o/[orgSlug]/"
const ALLOWED = new Set(["_shell", "_nav"])

/** @type {import('eslint').Rule.RuleModule} */
export default {
  meta: {
    type: "problem",
    docs: {
      description:
        "Forbid loose private folders (e.g. _components) in the rebuilt org tree; only _shell and _nav are allowed.",
      recommended: true,
    },
    schema: [],
    messages: {
      loose:
        "'{{folder}}/' is not an allowed folder in app/o/[orgSlug]. Only _shell/ and _nav/ may live here — group page compositions under the _shell anatomy (e.g. _shell/app-body/app-content/content-header or content-body). See apps/web/app/o/[orgSlug]/README.md.",
    },
  },

  create(context) {
    const filename = (context.filename ?? context.getFilename()).replace(
      /\\/g,
      "/",
    )
    const index = filename.indexOf(MARKER)
    if (index === -1) return {}

    // The path segments below the tree root, minus the file itself. A valid
    // path has at most one underscore-prefixed dir segment, and it must be
    // `_shell` or `_nav` (their descendants — app-body, content-header, ... —
    // are never underscore-prefixed, so any other `_x` segment is loose).
    const dirSegments = filename
      .slice(index + MARKER.length)
      .split("/")
      .slice(0, -1)
    const loose = dirSegments.find(
      (segment) => segment.startsWith("_") && !ALLOWED.has(segment),
    )
    if (!loose) return {}

    return {
      Program(node) {
        context.report({ node, messageId: "loose", data: { folder: loose } })
      },
    }
  },
}
