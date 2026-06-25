// Re-vendor the machine-readable KB subset from the Czech accounting KB Obsidian vault.
//
// The vendored subset is the ONLY KB surface the Brain consumes at runtime; the full
// markdown vault stays in Obsidian. This script makes the subset reproducible and the
// manifest (version.json -> files[].sha256) tamper-evident: re-running it reproduces
// byte-identical data files and manifest hashes (only `generated_at` changes), and any
// drift between a vendored file and its manifest hash is caught by verifyKbIntegrity() at load time.
//
// Usage:
//   node scripts/vendor.mjs [--source <vault-path>] [--version <kb_version>]
// Defaults:
//   --source   $ACCOUNTING_KB_SOURCE or the canonical vault location
//   --version  the kb_version already in version.json (or 0.1.0 on first vendor)
//
// Hleb bumps kb_version on every content change; each eval run records the kb_version it ran against.

import { createHash } from "node:crypto"
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { argv, env, exit } from "node:process"

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")
const DEFAULT_SOURCE = "/Users/hleb/Documents/Obsidian Vault/accountingAfframe"

function arg(name) {
  const i = argv.indexOf(`--${name}`)
  return i >= 0 && i + 1 < argv.length ? argv[i + 1] : undefined
}

const SOURCE = arg("source") ?? env.ACCOUNTING_KB_SOURCE ?? DEFAULT_SOURCE

// Explicit single-file picks: the subset is deliberate, not a blind copy of the vault.
const FILES = [
  { source: "20-coa/coa.json", dest: "coa.json", kind: "json" },
  {
    source: "30-predkontace/purchase/predkontace-purchase.json",
    dest: "predkontace/predkontace-purchase.json",
    kind: "json",
  },
  {
    source: "30-predkontace/sales/predkontace-sales.json",
    dest: "predkontace/predkontace-sales.json",
    kind: "json",
  },
  {
    source: "90-meta/INDEX-by-Q-pattern.md",
    dest: "q-pattern-index.md",
    kind: "text",
  },
]

// Whole decision-trees folder (every *.json classifier). README and non-json are skipped.
const TREES_SRC = "70-ai-platform/decision-trees"

function fail(msg) {
  console.error(`vendor: ${msg}`)
  exit(1)
}

if (!existsSync(SOURCE)) {
  fail(
    `source vault not found: ${SOURCE}\n  pass --source <path> or set ACCOUNTING_KB_SOURCE`,
  )
}

const treeFiles = readdirSync(join(SOURCE, TREES_SRC))
  .filter((f) => f.endsWith(".json"))
  .sort()
for (const f of treeFiles) {
  FILES.push({
    source: `${TREES_SRC}/${f}`,
    dest: `decision-trees/${f}`,
    kind: "json",
  })
}

// Fresh start: clear the data dirs so a removed source file does not linger.
for (const dir of ["decision-trees", "predkontace"]) {
  rmSync(join(PKG_ROOT, dir), { recursive: true, force: true })
}

const manifest = []
for (const f of FILES) {
  const srcPath = join(SOURCE, f.source)
  if (!existsSync(srcPath)) fail(`expected source file missing: ${f.source}`)
  const bytes = readFileSync(srcPath)
  if (f.kind === "json") {
    try {
      JSON.parse(bytes.toString("utf8"))
    } catch (e) {
      fail(`source JSON does not parse: ${f.source}\n  ${e.message}`)
    }
  }
  const destPath = join(PKG_ROOT, f.dest)
  mkdirSync(dirname(destPath), { recursive: true })
  writeFileSync(destPath, bytes)
  manifest.push({
    path: f.dest,
    source: f.source,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    bytes: bytes.length,
  })
}
manifest.sort((a, b) => a.path.localeCompare(b.path))

const prevVersion = existsSync(join(PKG_ROOT, "version.json"))
  ? JSON.parse(readFileSync(join(PKG_ROOT, "version.json"), "utf8")).kb_version
  : undefined
const kbVersion = arg("version") ?? prevVersion ?? "0.1.0"

const versionDoc = {
  kb_version: kbVersion,
  generated_at: new Date().toISOString(),
  generator: "packages/accounting-kb/scripts/vendor.mjs",
  source_vault: "Czech accounting KB (Obsidian vault accountingAfframe)",
  source_snapshot: "wave-7 canonical (2026-05/06)",
  regime_scope: ["podnikatelé"],
  note: "Machine-readable KB REFERENCE consumed as a confidence signal — NOT executable write templates. The booking path stays agent-native; předkontace are reference knowledge, like an accountant's předkontace handbook.",
  contents: {
    coa: "coa.json",
    predkontace: manifest
      .filter((m) => m.path.startsWith("predkontace/"))
      .map((m) => m.path),
    decision_trees: manifest
      .filter((m) => m.path.startsWith("decision-trees/"))
      .map((m) => m.path),
    q_pattern_index: "q-pattern-index.md",
  },
  files: manifest,
}

writeFileSync(
  join(PKG_ROOT, "version.json"),
  `${JSON.stringify(versionDoc, null, 2)}\n`,
)

console.log(
  `vendor: kb_version=${kbVersion}, ${manifest.length} files vendored from ${SOURCE}`,
)
