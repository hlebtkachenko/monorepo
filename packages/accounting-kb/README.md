# @workspace/accounting-kb

Vendored **machine-readable subset** of the Czech accounting knowledge base — the only KB surface the
Afframe Brain consumes at runtime. The full markdown KB stays in the Obsidian vault; this package holds
just the structured artifacts the Brain reads as **reference knowledge** (a confidence signal), never as
executable write templates. The booking path stays agent-native.

## Layout

```
coa.json                 # Směrná účtová osnova — Podnikatelé (Decree 500/2002 Sb.)
predkontace/             # předkontace reference sets (purchase + sales), machine-readable
decision-trees/          # CZ-law classifiers (PDP, DPH registration, FX, depreciation, close, …)
q-pattern-index.md       # question → canonical-file retrieval router
version.json             # kb_version + provenance + sha256 manifest of every vendored file
src/index.ts             # typed loader: loadKb(), loadKbVersion(), kbVersion(), verifyKbIntegrity()
scripts/vendor.mjs       # reproducible re-vendor from the source vault + manifest regenerator
```

## Usage

```ts
import { loadKb, kbVersion, verifyKbIntegrity } from "@workspace/accounting-kb"

const kb = loadKb() // { version, coa, predkontace, decisionTrees, qPatternIndex }
const v = kbVersion() // record this per eval run for reproducibility
const drift = verifyKbIntegrity() // [] when every vendored file matches its pinned sha256
```

## Versioning

`version.json.kb_version` is a human-set string Hleb bumps on every KB content change. Each Brain eval
run records the `kb_version` it ran against, so results are reproducible against a known KB snapshot.

`version.json.files[]` pins a `sha256` per vendored file. `verifyKbIntegrity()` recomputes them on load:
a vendored file edited without a re-vendor (and bump) fails loudly. This is the KB's tamper-evidence
anchor (BGTG philosophy) — the manifest, not prose, is ground truth.

## Re-vendoring

```
pnpm --filter @workspace/accounting-kb vendor -- --version <new-kb_version>
```

Reads the source vault (default: the canonical `accountingAfframe` Obsidian location; override with
`--source <path>` or `ACCOUNTING_KB_SOURCE`), copies the whitelisted subset byte-for-byte, validates
every JSON parses, and regenerates `version.json` with fresh hashes. The whitelist (`scripts/vendor.mjs`)
is deliberate — the subset is curated, not a blind copy of the vault.
