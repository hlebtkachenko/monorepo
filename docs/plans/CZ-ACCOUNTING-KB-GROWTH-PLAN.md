# Czech Accounting KB — Growth & Optimization Plan

**Owner:** Hleb Tkachenko
**Created:** 2026-05-25
**Status:** Plan — Wave 8+ execution map
**Related:** `docs/plans/AI-FINANCIAL-AGENTS-PLAN.md`

This plan covers every vector to grow and optimize the Czech Accounting Knowledge Base (canonical artifact at `~/Documents/Obsidian Vault/accountingAfframe/`) that powers Afframe's AI Financial Agents. Wave 1–7 brought the KB from greenfield to Haiku-safe (10/10 validation). Wave 8+ takes it to "ultimate" — agent-native by default, drift-resistant, multi-tenant, with predictive capabilities on the horizon.

## Wave 1–7 baseline (what we have)

| Item                             | State                                                                                                              |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Canonical content artifacts      | 286 .md + 33 READMEs = 319 surface files                                                                           |
| Advisor briefs                   | 25 (8 RED + 17 AMBER)                                                                                              |
| Decision-tree JSONs              | 15 (+1 archived legacy)                                                                                            |
| Primary-source evidence files    | 10 (F2A.1–10)                                                                                                      |
| Wave 6 — § 34a R&D deep research | 6-file canonical folder + W6A/W6B research outputs                                                                 |
| Wave 7 — agent-native indexes    | 90-meta/INDEX-by-{account,rozvaha-row,vzz-row,Q-pattern} + GLOSSARY (155 terms) + ACCOUNT-INDEX.csv (236 accounts) |
| Wave 7 — playbooks               | 7 baseline (jednatel loans × 2, jednatel expenses, reklasifikace, donation, year-end 431→428, plus README)         |
| Wave 7 — DT manifest             | 70-ai-platform/queries/MANIFEST.md routing 16 DTs                                                                  |
| Haiku 4.6 retrieval validation   | **10/10 success**, avg 4.8k tokens/Q (down 31% from baseline)                                                      |

## Why this plan

A user asked the KB 15 questions in one session. Findings:

- 5/15 Qs answered without KB check (risk pattern)
- R&D capitalization gap forced mid-session Wave 6 (30-min cost)
- Grep-then-Read antipattern dominates retrieval (5–15k tokens per Q)
- 15 DT JSONs existed but **zero used** in session
- Czech terms not cross-indexed for non-Czech speakers

Wave 7 fixed retrieval for **common scenarios**. Wave 8+ extends coverage, hardens quality, adds MCP tooling, opens commercial paths.

## 18 growth vectors

### 1. Content depth (coverage)

**Quick wins (this week, ~3 hours each)**

| Item                                                                                                                 | Why                                                      |
| -------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- |
| Build 43 remaining playbooks (Wave 7 designed 50, shipped 7)                                                         | 86 % of top-50 scenarios still need pre-computed answers |
| Address 6 hard GAPS (R&D capitalization, OSVČ zálohy, § 79 ZDPH, reklasifikace generic, dar donee-side, 365 anomaly) | W7.S2 audit identified                                   |
| Add EN aliases to INDEX-by-Q-pattern entries                                                                         | W7.VAL friction with EN queries                          |
| Resolve 22 orphan files (link or delete)                                                                             | Navigation rot                                           |
| Fix 302 broken wikilinks                                                                                             | Obsidian nav broken                                      |

**Coverage gaps (deferred)**

| Domain                 | Gap                                                                         |
| ---------------------- | --------------------------------------------------------------------------- |
| DPFO comprehensive     | ~60 % coverage; DPPO dominates; OSVČ/freelance thin                         |
| Non-profits            | Surface in `non-profits-addendum.md`; nadace/ústav/spolek/církev need depth |
| Příspěvkové organizace | Out of scope Stage 1; ~30 % of CZ entities                                  |
| Audit standards (KAČR) | ISA 200–810 named only, not ingested                                        |
| NÚR I-38–54            | W5.G1 backlog — 17 newer interpretations missing                            |
| Labor Code 2024 reform | W5.G4 — § 112 abolished, § 87a self-scheduling, details thin                |
| Konsolidace            | Q47 partial — thresholds missing                                            |
| Insolvence / likvidace | Low-confidence flags unresolved                                             |

### 2. Retrieval / token cost (highest leverage)

**MCP tooling (Wave 8 priority)**

| Tool                                                      | Saving vs. current                  |
| --------------------------------------------------------- | ----------------------------------- |
| `dt_query(name, inputs)` → structured JSON verdict        | 5–15k → 200–500 tokens (**15–30×**) |
| `account_lookup(acct)` → CSV row                          | 3–8k → <300 tokens (**15×**)        |
| `glossary_lookup(term)` → 1 entry                         | 5k+ → <300 tokens (**20×**)         |
| `q_pattern_route(question)` → semantic playbook ID        | 3 calls → 1 call (**3×**)           |
| `predkontace_lookup(transaction_type)` → MD/D + tax notes | 8k → <500 tokens                    |
| `rozvaha_row_lookup(row_code)` → účty + caveat            | 5k → <500 tokens                    |

**Embeddings + vector search (Wave 9)**

- Chunk KB (~200 words/chunk) → embed (nomic-embed-text local or Voyage) → pgvector
- Hybrid retrieval: vector + BM25 + Q-pattern routing
- Re-ranking with bge-reranker for top-K precision
- Estimated ~64k chunks (200 chunks × 320 files); manageable in pgvector

**Caching layers**

| Layer                                      | Saving                                |
| ------------------------------------------ | ------------------------------------- |
| Anthropic prompt cache (5-min TTL)         | 5× cost reduction on repeated context |
| Static playbook → encoded once per session | Free reads after first                |
| Q-pattern → playbook routing memoized      | Free lookup after first               |

**Model routing**

| Tier                      | Model      | Use                 |
| ------------------------- | ---------- | ------------------- |
| L1 — DT / index lookup    | Haiku 4.6  | 80 % Qs             |
| L2 — Playbook synthesis   | Sonnet 4.6 | 15 % multi-step     |
| L3 — Edge case + research | Opus 4.7   | 5 % unresolved gaps |

Mixed routing → ~10× cheaper than all-Opus.

### 3. Quality assurance

**Verification**

| Item                                                       | Why                                                            |
| ---------------------------------------------------------- | -------------------------------------------------------------- |
| Advisor cycle — send DELIVERY pack to Czech daňový poradce | 55 % files at `confidence: medium`, advisor would lift to high |
| Quarterly verifier sweeps (Sonnet bg)                      | Laws change, primary URLs drift                                |
| Two-Tier-A cross-check per canonical claim                 | C9 regression lesson — single source insufficient              |
| KOOV / NSS / NÚR monitoring (RSS)                          | New stanoviska / judgments not auto-detected                   |

**Eval harness**

| Item                                                               | Detail           |
| ------------------------------------------------------------------ | ---------------- |
| Golden dataset — 500 Q/A pairs reviewed by advisor                 | Ground truth     |
| Regression suite — run nightly via GitHub Actions                  | Catch KB drift   |
| Confidence calibration — when KB says "high", is it correct ≥95 %? | Calibrate rubric |
| Adversarial Qs — same Q rephrased 5 ways, all same answer          | Robustness       |
| Multi-hop Qs — "If X, then Y, what's tax impact of Z?"             | Composition test |

**Confidence rubric tightening**

Add to existing high/medium/low:

- "Primary law verified within 30 days" → upgrade flag
- "NSS / KOOV opinion exists" → strengthen
- "Advisor confirmed" → highest tier
- "Multi-source consistency check" — 2 Tier-A agreeing = high; conflict flagged

### 4. Agent ergonomics (UX for agents)

**Structured outputs**

- Every playbook ends with JSON schema output (`{entries: [...], tax_deductible, vh_impact, dph_impact, caveats}`)
- Účtování in JSON (not just markdown table)
- Caveats tagged (`tax-deductibility`, `dph-treatment`, `vh-impact`) — filterable per Q context

**Discoverability**

- `90-meta/CLAUDE.md` — agent-only instructions overriding human-facing docs
- `90-meta/RETRIEVAL-PATTERNS.md` — explicit "if you see X type of Q, do Y"
- `90-meta/ANTI-PATTERNS.md` — common mistakes (e.g., "Don't confuse 355 with 354")
- `00-INDEX.md` — add "agent quick-start" section

**Deterministic answer format**

```yaml
verdict:
  rule: "MD 543 / D 221"
  tax_deductible: false
  vh_impact: -200000
  dph_impact: 0
  primary_law: ["§ 25/1/o ZDP", "§ 20/8 ZDP"]
  confidence: high
  caveats: ["10% limit on Ř.180", "min 2000 CZK"]
```

Forces agent to know exactly what fields exist.

### 5. Maintenance / drift prevention

**Automated change tracking**

| Item                                                                    | Detail                                |
| ----------------------------------------------------------------------- | ------------------------------------- |
| Cron monitoring zakonyprolidi.cz / e-sbirka.gov.cz for tracked §        | Flag amendments → spawn Sonnet review |
| RSS feed from financnisprava.gov.cz tiskové zprávy                      | Catch new GFŘ Pokyny                  |
| Yearly threshold sweep (15.12 budget vyhláška)                          | Update F2A primary-source evidence    |
| Diff-aware sync — when zákon X changes, alert all files referencing § X | Cascading update                      |

**Versioning**

| Item                                | Detail                                    |
| ----------------------------------- | ----------------------------------------- |
| Tag annual snapshot (v2026, v2027)  | Time-traveling Q "what was rule in 2025?" |
| Git history → immutable changelog   | Audit trail                               |
| Schema versions on DT JSONs (W5.D1) | Tooling backward-compat                   |

**Maintenance protocol**

- `90-meta/MAINTENANCE-PROTOCOL.md` — when law changes, update which files in which order
- `90-meta/UPDATE-CHECKLIST.md` — pre/post-amendment workflow
- Avoid drift between playbook ↔ scenario file

### 6. Scaling

**Multi-tenant architecture**

- Per-client KB extensions (proprietary rulings, internal policy)
- Org-specific playbooks without polluting canonical
- Privacy boundary — canonical = public, org-specific = isolated

**Knowledge graph**

- Entities: laws, accounts, scenarios, judgments, advisors
- Relationships: "§ 24/2/i references Act 593/1992", "Account 543 → F. VZZ row"
- Queries: "show me all files affected if § 34a changes"
- Auto-derive from current cross-refs + frontmatter

**CodeGraph for KB**

Same approach as `puebla` repo — graphify markdown wikilinks + frontmatter. Then `kb_graph_query("what depends on Act 593/1992")` returns full dependency tree.

### 7. Tooling expansion

**MCP servers (own implementation)**

| Server                | Purpose                                                |
| --------------------- | ------------------------------------------------------ |
| `mcp-acckb`           | KB MCP — query, lookup, route, verify                  |
| `mcp-czaccounting-dt` | DT execution engine                                    |
| `mcp-cz-tax-calc`     | Actual tax calculators — DPPO, DPH, DPFO, payroll      |
| `mcp-cz-law-monitor`  | Change detection — watches zakonyprolidi, emits events |

**Editor integration**

- Cursor / Claude Code → load KB context automatically via `.claude/context.json`
- Obsidian plugin — query KB from inside Obsidian (for human advisor use)

**Observability**

- Log every agent Q → KB retrieval path (heatmap which playbooks used, which Qs fail)
- Token spend per Q type (cost dashboard)
- Confidence calibration metrics (advisor truth comparison)

### 8. Production deployment

**A/B testing**

| Variant | Detail                       |
| ------- | ---------------------------- |
| A       | Full KB retrieval (baseline) |
| B       | KB + playbooks               |
| C       | KB + MCP tools               |
| D       | Vector search                |

Measure cost + quality delta per variant.

**Eval-driven dev**

- Every PR to KB → run eval suite; block if golden Q regresses
- Per-domain eval (DPH, DPPO, DPFO, payroll, intracom) — catch domain-specific regression
- Czech-language eval Qs — validate translation quality

**Golden datasets**

| Set        | Size | Purpose                                       |
| ---------- | ---- | --------------------------------------------- |
| Core Q/A   | 500  | Ground truth, advisor-reviewed                |
| Edge cases | 100  | Stress test                                   |
| Multi-step | 50   | Composition                                   |
| "Trick" Qs | 50   | Disambiguation (terms with multiple meanings) |

Quarterly refresh.

### 9. Domain expansion

**Adjacent domains**

| Domain                                             | Effort                           | Value                  |
| -------------------------------------------------- | -------------------------------- | ---------------------- |
| CZ Labor Code (Zákoník práce) standalone reference | High (already in payroll/)       | Medium                 |
| GDPR / data protection                             | None today                       | Medium                 |
| AML / KYC for accounting firms                     | None                             | Low                    |
| Audit standards detail (KAČR ISA)                  | Surface only                     | Medium                 |
| M&A — transformace, fúze, akvizice                 | None                             | Medium                 |
| Bankruptcy law detail (Act 182/2006)               | Insolvence covered, broader thin | Medium                 |
| Public procurement (Act 134/2016)                  | None                             | Low (not Afframe core) |
| EU directives (CRD, MIFID, AIFMD)                  | None                             | Low                    |

**Industry verticals (deepen)**

| Vertical        | Current           | Add                                  |
| --------------- | ----------------- | ------------------------------------ |
| Construction    | § 92ba covered    | Material contracts, subdodávky       |
| Real estate dev | § 56 covered      | Záměry, DPH on land sale             |
| E-commerce      | OSS/IOSS covered  | Returns, refunds, chargebacks        |
| Manufacturing   | Sklad A/B covered | WIP costing, mfg overhead            |
| Services        | Surface           | Subscription accounting, prepayments |
| Holdingy        | TP covered        | Cash pooling, intercompany matching  |

### 10. Multilingual / localization

| Item                                        | Detail                            |
| ------------------------------------------- | --------------------------------- |
| Czech is canonical; EN translations partial | Make every file bilingual         |
| EN aliases in indexes (W7.V1 in backlog)    | Agent EN Q matching               |
| Glossary EN→CS reverse lookup               | For non-Czech advisors            |
| Future: SK (Slovak) parity                  | Similar tax regime, future market |

### 11. Business / commercial

**Pricing tiers**

| Tier       | Price   | Includes                                             |
| ---------- | ------- | ---------------------------------------------------- |
| Free       | $0      | KB read-only, public playbooks                       |
| Pro        | $50/mo  | Per-org playbook authoring, MCP tools                |
| Advisor    | $500/mo | Multi-client, advisor markup, certified ground truth |
| Enterprise | Custom  | Custom KB extensions, dedicated support, audit log   |

**Advisor marketplace**

| Item                                                       | Detail                         |
| ---------------------------------------------------------- | ------------------------------ |
| Verified advisors contribute new playbooks → revenue share | Curated content network        |
| "Reviewed by [advisor]" attribution → credibility          | Like Wikipedia editorial trust |
| Continuing education credit for Afframe-using advisors     | Lock-in                        |

**White-label**

- Accounting firms brand the KB ("Afframe powered by Henderson Profese")
- API endpoints for ERP integration (Money S3 / Pohoda / Helios)

### 12. AI-native UX

| Item                                 | Detail                                                     |
| ------------------------------------ | ---------------------------------------------------------- |
| Chat UI — accounting bot             | Natural language → playbook → answer                       |
| Structured form Q → JSON answer      | "Fill in transaction type / amount / DPH plátce" → verdict |
| Voice input for mobile accountants   | "Jak zaúčtovat dar 200k?"                                  |
| Doc upload → OCR → predkontace návrh | Upload faktura → AI suggests účtování                      |

### 13. Data ingestion automation

| Item                                         | Detail                                     |
| -------------------------------------------- | ------------------------------------------ |
| Auto-ingest e-sbirka changelog               | New zákony parsed → relevant files flagged |
| Pohoda / Money / Helios product manuals → KB | Cross-validate against canonical           |
| ASPI scraping (paid, premium tier)           | Wolters Kluwer commentary                  |

### 14. Compliance / governance

| Item                                                                        | Detail                                                      |
| --------------------------------------------------------------------------- | ----------------------------------------------------------- |
| GDPR — no PII in KB                                                         | Already clean, validate                                     |
| Attribution — advisor consent for "verified by"                             | Per ADR                                                     |
| Conflict of interest — disclosure policy for Afframe staff advising clients |                                                             |
| Audit log — who changed which file when                                     | Already via git                                             |
| Liability disclaimer                                                        | KB is informational, not legal advice; footer on every page |

### 15. Performance benchmarks

| Metric               | Current (Wave 7) | Target Wave 8  | Target Wave 12            |
| -------------------- | ---------------- | -------------- | ------------------------- |
| Haiku Q success rate | 10/10 baseline   | 50/50 extended | 200/200                   |
| Avg tokens / Q       | 4.8k             | <3k            | <1k                       |
| Avg latency          | ~10s             | <5s            | <2s                       |
| Coverage gaps        | 6 hard           | 0 hard         | 0 hard + edge             |
| Confidence: high     | 22 %             | 50 %           | 80 %                      |
| Broken wikilinks     | 302              | 0              | 0 (CI-enforced)           |
| Playbooks            | 7/50             | 50/50          | 100+ (industry verticals) |

### 16. Strategic priorities (recommended order)

**Wave 8 (~1 week)**

1. Fix hygiene — 302 broken links + claims manifests (W7.H1–H8)
2. English aliases — W7.V1 (validator-identified)
3. Six hard GAPS — W7.G1–G6
4. MCP tooling — `account_lookup` + `glossary_lookup` (W7.M1–M3)
5. Advisor send — DELIVERY pack to Czech daňový poradce; await response

**Wave 9 (~2 weeks)**

1. 43 more playbooks (P11–P104 designed in W7)
2. 6 new DTs (W7.D1–D6)
3. DT MCP — `dt_query`
4. Eval harness — golden dataset 500 Q/A + GitHub Actions
5. Embeddings + pgvector — semantic recall

**Wave 10 (~1 month)**

1. Knowledge graph — entities + relationships
2. CodeGraph for KB
3. Change monitoring — RSS / cron on zakonyprolidi
4. Multi-tenant — per-org extensions
5. Versioning — v2026 immutable snapshot

**Wave 11+ (strategic, multi-month)**

1. Advisor marketplace
2. Industry verticals (construction, manufacturing deep dives)
3. EN/SK localization
4. Production SaaS API
5. Chat UI for end users

### 17. Top 5 highest-leverage moves (do these first)

| #   | Action                                                | Why                                     | Effort           | Token saving       |
| --- | ----------------------------------------------------- | --------------------------------------- | ---------------- | ------------------ |
| 1   | MCP `account_lookup` + `glossary_lookup` + `dt_query` | 80 % Qs become 1-call                   | ~3 days          | 15×                |
| 2   | Advisor cycle — get human ground truth                | Confidence: medium → high on 200+ files | 2–4 weeks        | Quality            |
| 3   | 50 playbooks complete (43 more)                       | Coverage hits 100 % top-50              | ~1 week parallel | 5×                 |
| 4   | Eval harness + golden dataset                         | Catch regression before deploy          | 1 week           | Quality            |
| 5   | Embeddings + hybrid search                            | Semantic recall + cheap retrieval       | 1–2 weeks        | 10× on uncommon Qs |

### 18. Visionary (year+)

| Vision                   | Detail                                                                                |
| ------------------------ | ------------------------------------------------------------------------------------- |
| Self-updating KB         | Laws change → agents auto-research → propose KB updates → human (or advisor) approves |
| Multi-agent advisor team | Specialized agents per domain (DPH, payroll, R&D) auto-collaborate                    |
| Predictive accounting    | KB feeds into transaction-level AI that predicts účtování before user does it         |
| Compliance autopilot     | KB + transaction data → "you owe X CZK DPH by Y" automated reminders                  |
| Czech-only LLM fine-tune | Train Llama/Mistral on Czech accounting → cheaper than Anthropic for L1 lookups       |
| Network effects          | More advisors → more confirmations → KB > any single advisor's knowledge              |

## Path to ultimate

```
NOW   (Wave 8):     hygiene + EN aliases + MCP basics + advisor cycle
+1mo  (Wave 9-10):  50 playbooks + eval harness + embeddings + knowledge graph
+3mo  (Wave 11+):   advisor marketplace + industry depth + production API
+1yr  (vision):     self-updating + predictive + Czech LLM fine-tune
```

**Highest ROI right now:** advisor cycle (lifts entire KB confidence) + 3 MCP tools (15× retrieval cost reduction). Run both in parallel.

## Linear epic + subissues

This plan is tracked as a Linear epic in DEV/AI project with one subissue per growth vector. Subissues are sized for atomic agent execution. Cross-references on each subissue point back to the relevant section of this document.

## Cross-references

- `~/Documents/Obsidian Vault/accountingAfframe/_state/AGENT-NATIVE-PLAN.md` — Wave 7 deliverable + initial Wave 8 backlog
- `~/Documents/Obsidian Vault/accountingAfframe/_state/WAVE-5-BACKLOG.md` — all open backlog items by wave
- `~/Documents/Obsidian Vault/accountingAfframe/_state/STAGE-LOG.md` — append-only execution log
- `docs/plans/AI-FINANCIAL-AGENTS-PLAN.md` — consumer of this KB
- `docs/adr/` — architectural decisions
