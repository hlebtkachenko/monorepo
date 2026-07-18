/**
 * Pure helper: map `chore(deps...)` commit subjects into deduped, concise
 * `### Dependencies` bullets by stripping the `chore(deps)` / `chore(deps-dev)`
 * prefix. The rest of the Dependabot-authored subject (package name(s),
 * old -> new version or digest, PR number) is kept as-is.
 *
 * Dependabot PRs are exempt from the per-PR fragment gate, so their bumps land
 * no fragment. `collect-changelog.mjs` recovers them at release-cut by scanning
 * commit subjects since the last tag and folding them into the Dependencies
 * section.
 *
 * @param {string[]} commitSubjects
 * @returns {string[]}
 */
const DEPS_PREFIX_RE = /^chore\(deps[^)]*\):\s*/i

export function synthesizeDependencyBullets(commitSubjects) {
  const seen = new Set()
  const bullets = []

  for (const subject of commitSubjects) {
    const stripped = subject.trim().replace(DEPS_PREFIX_RE, "").trim()
    if (!stripped || seen.has(stripped)) continue

    seen.add(stripped)
    bullets.push(stripped)
  }

  return bullets
}
