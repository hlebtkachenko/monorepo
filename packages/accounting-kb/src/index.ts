// @workspace/accounting-kb — typed loader over the vendored machine-readable KB subset.
//
// The KB is REFERENCE knowledge (decision trees, předkontace, chart of accounts, Q-pattern
// index) the Brain consults as a confidence signal — never an executable write template. The
// booking path stays agent-native (see version.json `note`). Data lives at the package root;
// this loader resolves it relative to the package, parses JSON, and can verify manifest
// integrity (every vendored file's sha256 is pinned in version.json — a silent edit fails loudly).

import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const PKG_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..")

export interface KbFileEntry {
  /** Path relative to the package root. */
  path: string
  /** Original path inside the source KB vault (provenance). */
  source: string
  /** sha256 of the vendored bytes, pinned at vendor time. */
  sha256: string
  bytes: number
}

export interface KbVersion {
  /** Human-set version Hleb bumps on every KB content change; recorded per eval run. */
  kb_version: string
  generated_at: string
  generator: string
  source_vault: string
  source_snapshot: string
  regime_scope: string[]
  note: string
  contents: {
    coa: string
    predkontace: string[]
    decision_trees: string[]
    q_pattern_index: string
  }
  files: KbFileEntry[]
}

export interface LoadedKb {
  version: KbVersion
  /** Směrná účtová osnova (Decree 500/2002), parsed. */
  coa: unknown
  predkontace: { purchase: unknown; sales: unknown }
  /** Keyed by tree name (filename without `.json`). */
  decisionTrees: Record<string, unknown>
  /** The Q-pattern retrieval router, raw markdown. */
  qPatternIndex: string
}

export interface IntegrityMismatch {
  path: string
  expected: string
  actual: string | null
}

function readBytes(rel: string): Buffer {
  return readFileSync(join(PKG_ROOT, rel))
}

function readJson(rel: string): unknown {
  return JSON.parse(readBytes(rel).toString("utf8"))
}

/** Parse and return version.json (the manifest). */
export function loadKbVersion(): KbVersion {
  return readJson("version.json") as KbVersion
}

/** The current vendored KB version string. */
export function kbVersion(): string {
  return loadKbVersion().kb_version
}

/** Load the full vendored KB subset into memory. */
export function loadKb(): LoadedKb {
  const version = loadKbVersion()

  const decisionTrees: Record<string, unknown> = {}
  for (const rel of version.contents.decision_trees) {
    const name = rel.replace(/^decision-trees\//, "").replace(/\.json$/, "")
    decisionTrees[name] = readJson(rel)
  }

  const purchase = version.contents.predkontace.find((p) =>
    p.includes("purchase"),
  )
  const sales = version.contents.predkontace.find((p) => p.includes("sales"))
  if (!purchase || !sales) {
    throw new Error(
      "accounting-kb: version.json contents.predkontace is missing purchase/sales",
    )
  }

  return {
    version,
    coa: readJson(version.contents.coa),
    predkontace: { purchase: readJson(purchase), sales: readJson(sales) },
    decisionTrees,
    qPatternIndex: readBytes(version.contents.q_pattern_index).toString("utf8"),
  }
}

/**
 * Recompute the sha256 of every manifest file and compare to the pinned hash.
 * Returns the (hopefully empty) list of drifts — a vendored file changed without a re-vendor.
 */
export function verifyKbIntegrity(): IntegrityMismatch[] {
  const { files } = loadKbVersion()
  const mismatches: IntegrityMismatch[] = []
  for (const entry of files) {
    let actual: string | null
    try {
      actual = createHash("sha256").update(readBytes(entry.path)).digest("hex")
    } catch {
      actual = null
    }
    if (actual !== entry.sha256) {
      mismatches.push({ path: entry.path, expected: entry.sha256, actual })
    }
  }
  return mismatches
}
