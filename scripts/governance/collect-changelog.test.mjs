import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { after, before, test } from "node:test"

const SCRIPT = join(
  dirname(fileURLToPath(import.meta.url)),
  "collect-changelog.mjs",
)

let repo
let boundarySha

/** Run a git command in the fixture repo, asserting success. */
function git(...args) {
  const r = spawnSync("git", args, { cwd: repo, encoding: "utf8" })
  assert.equal(r.status, 0, `git ${args.join(" ")}: ${r.stderr}`)
  return r.stdout.trim()
}

/** Add one fragment file in its own commit, returning that commit's SHA. */
function commitFragment(name, category, body, subject) {
  writeFileSync(
    join(repo, "changelog.d", `${name}.md`),
    `---\ncategory: ${category}\n---\n${body}\n`,
  )
  git("add", `changelog.d/${name}.md`)
  git("commit", "-qm", subject)
  return git("rev-parse", "HEAD")
}

function collect(...args) {
  return spawnSync("node", [SCRIPT, ...args], { cwd: repo, encoding: "utf8" })
}

before(() => {
  // A fixture repo: four already-merged PR fragments across four commits.
  repo = mkdtempSync(join(tmpdir(), "collect-changelog-"))
  git("init", "-q")
  git("config", "user.email", "t@t.t")
  git("config", "user.name", "t")
  writeFileSync(
    join(repo, "CHANGELOG.md"),
    "## [Unreleased]\n\nExplainer.\n\n## [v0.1.0] — 2026-01-01\n\n- seed\n",
  )
  mkdirSync(join(repo, "changelog.d"))
  git("add", "-A")
  git("commit", "-qm", "seed")

  commitFragment("a", "Added", "PR one feature", "feat: one (#101)")
  boundarySha = commitFragment("b", "Fixed", "PR two bugfix", "fix: two (#102)")
  commitFragment("c", "Added", "PR three feature", "feat: three (#103)")
  commitFragment("d", "Changed", "PR four change", "chore: four (#104)")
})

after(() => {
  if (repo) rmSync(repo, { recursive: true, force: true })
})

test("--through cuts only fragments merged up to the boundary; the rest stay", () => {
  const r = collect("--version", "v0.2.0", "--through", boundarySha)
  assert.equal(r.status, 0, r.stderr)

  const changelog = readFileSync(join(repo, "CHANGELOG.md"), "utf8")
  assert.match(changelog, /## \[v0\.2\.0\]/)
  assert.match(changelog, /PR one feature \(#101\)/)
  assert.match(changelog, /PR two bugfix \(#102\)/)
  assert.doesNotMatch(changelog, /PR three feature/)
  assert.doesNotMatch(changelog, /PR four change/)

  // Consumed fragments deleted, deferred ones left pending.
  assert.ok(!existsSync(join(repo, "changelog.d", "a.md")))
  assert.ok(!existsSync(join(repo, "changelog.d", "b.md")))
  assert.ok(existsSync(join(repo, "changelog.d", "c.md")))
  assert.ok(existsSync(join(repo, "changelog.d", "d.md")))
})

test("default (no --through) previews every fragment still present", () => {
  const r = collect("--dry-run")
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /PR three feature/)
  assert.match(r.stdout, /PR four change/)
})

test("an unresolvable --through ref fails with exit 2", () => {
  const r = collect("--version", "v0.3.0", "--through", "no-such-ref")
  assert.equal(r.status, 2)
  assert.match(r.stderr, /not a valid commit/)
})

test("--through with no value fails instead of silently cutting everything", () => {
  const r = collect("--version", "v0.3.0", "--through")
  assert.equal(r.status, 2)
  assert.match(r.stderr, /--through requires a <ref> value/)
})

test("--through scopes synthesized Dependabot bullets to the boundary", () => {
  // A dep bump merged before the boundary, another after it.
  git("commit", "--allow-empty", "-qm", "chore(deps): bump early from 1 to 2")
  const boundary = git("rev-parse", "HEAD")
  git("commit", "--allow-empty", "-qm", "chore(deps): bump late from 3 to 4")

  const r = collect("--dry-run", "--since", "HEAD~2", "--through", boundary)
  assert.equal(r.status, 0, r.stderr)
  assert.match(r.stdout, /bump early from 1 to 2/)
  assert.doesNotMatch(r.stdout, /bump late from 3 to 4/)
})
