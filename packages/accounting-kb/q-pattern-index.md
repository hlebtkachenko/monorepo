---
title: "INDEX by Q-Pattern — Common Czech Accounting Questions → Canonical Files"
type: meta-index
status: canonical
confidence: high
last_updated: 2026-05-25
maintainer: opus-orchestrator
wave: 7
purpose: "Agent retrieval router. Match user Q to pattern → fetch canonical file in single call. <500 tokens for 90% of common questions."
---

# INDEX by Q-Pattern

**Use this FIRST before any grep.** Match user question to pattern, retrieve named file. Saves 3-5 tool calls vs. grep-then-read pattern.

**Pattern matching:** keyword overlap or semantic equivalent. If no pattern matches → fall through to grep on [[INDEX-by-account]] (for account/Rozvaha Qs) or [[GLOSSARY]] (for term definitions) or full grep.

> Last updated: 2026-06-04 — added IO reverse-charge row (G8/W6 finding from REM stress test).

---

## Founder / Owner / Jednatel Scenarios (5 Q patterns)

| Q pattern keywords | Canonical playbook |
|---|---|
| jednatel půjčuje firmě, společník půjčuje firmě, owner loan to company | [[40-workflows/playbooks/jednatel-loan-to-company]] |
| firma půjčuje jednateli, půjčka jednateli, firm loans to director | [[40-workflows/playbooks/firm-loan-to-jednatel]] |
| jednatel platí faktury za firmu, výdaje ze soukromých peněz | [[40-workflows/playbooks/jednatel-pays-company-expenses]] |
| reklasifikace pohledávky na třetí osobu, postoupení 355 | [[40-workflows/playbooks/reklasifikace-355-to-378]] |
| jednatel inkasuje platby na osobní účet | [[40-workflows/playbooks/jednatel-collects-on-personal-account]] (playbook pending) |

## Year-End Close (10 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| zaúčtování VH 710 → 431, transfer výsledku hospodaření | [[40-workflows/year-end-closing/05-DPPO-zaklad-dane]] |
| rozdělení zisku, retained earnings, VH ve schvalovacím řízení → 428 | [[40-workflows/year-end-closing/procedural/05-valna-hromada-approval-mechanics]] |
| valná hromada schválení závěrky, deadline 6 měsíců | [[40-workflows/year-end-closing/procedural/05-valna-hromada-approval-mechanics]] |
| jediný společník per rollam, sole shareholder resolution | [[40-workflows/year-end-closing/procedural/05-valna-hromada-approval-mechanics]] |
| inventarizace, fyzická inventura | [[40-workflows/year-end-closing/01-inventarizace]] |
| dohadné účty 388/389 | [[40-workflows/year-end-closing/03-dohadne-ucty]] |
| odložená daň účtování, CUS-003 | [[40-workflows/year-end-closing/07-odlozena-dan-CUS-003]] |
| zveřejnění závěrky ve Sbírce listin | [[40-workflows/year-end-closing/procedural/06-publication-mechanics]] |
| DPPO daňové přiznání řádky | [[40-workflows/year-end-closing/06-DPPO-DAP-radky]] |
| základ daně výpočet, transformace VH na základ daně | [[40-workflows/year-end-closing/05-DPPO-zaklad-dane]] |

## DPH (10 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| § 56 / § 56a nemovitosti DPH | [[40-workflows/DPH/paragraph-56-real-estate]] |
| § 92ba PDP stavebnictví, reverse charge | [[40-workflows/DPH/PDP-92ba/README]] |
| § 73 nárok na odpočet vzniká | [[40-workflows/DPH/advances]] (+ [[80-advisor-pack/AMBER-16-DPH-deduction-invoice-receipt-timing]]) |
| § 75/§ 76 koeficient krácení | [[40-workflows/DPH/kraceni]] |
| OSS/IOSS e-commerce EU | [[40-workflows/DPH/OSS-IOSS/README]] |
| kontrolní hlášení, KH penalty | [[40-workflows/DPH/kh-sh]] + [[60-deadlines-penalties/penalty-matrix]] |
| zjednodušený daňový doklad pod 10 000 | [[40-workflows/DPH/doklady]] |
| DPH registrace, plátce/neplátce/IO | [[40-workflows/DPH/registration]] |
| intracom dodávky, VIES souhrnné hlášení | [[40-workflows/DPH/intracom]] |
| § 42a / § 74a former-payer adjustments (post-2025) | [[40-workflows/DPH/former-payer-adjustments]] |

## Payroll & OSVČ (8 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| mzdy předkontace 521/331/336/342 | [[40-workflows/payroll/13-mzdove-predkontace]] |
| DPP/DPČ 2024+ thresholds | [[40-workflows/payroll/02-DPP-DPC]] |
| stravenkový paušál 2026 | [[40-workflows/payroll/03-stravenkovy-pausal]] |
| cestovní náhrady tuzemsko MPSV 2026 | [[40-workflows/payroll/05-cesty-tuzemske]] |
| dovolená nárok + náhrada za nevyčerpanou | [[40-workflows/payroll/08-dovolena]] |
| OSVČ odvody | [[40-workflows/payroll/12-OSVC-odvody]] |
| paušální daň pro OSVČ | [[70-ai-platform/primary-source-evidence/F2A.7-pausalni-dan-2026]] |
| benefity zaměstnancům 2026 cap | [[40-workflows/payroll/04-benefity]] + [[80-advisor-pack/AMBER-17-volnocasove-benefity-2026-MPSV]] |

## DPPO + DPFO Tax (6 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| § 34a R&D odpočet, software R&D kvalifikace | [[40-workflows/RD-deduction/README]] |
| § 20/8 dar, charity deduction | [[40-workflows/year-end-closing/05-DPPO-zaklad-dane]] (§ 20/8 section) |
| daňové vs účetní odpisy | [[50-scenarios/DHM-lifecycle/depreciation-methods]] |
| DPPO zálohy § 38a | [[40-workflows/year-end-closing/08-zalohy-DPPO]] |
| daňová ztráta carryforward 5 let | [[40-workflows/year-end-closing/05-DPPO-zaklad-dane]] (§ 34/1) |
| transfer pricing dokumentace | [[50-scenarios/intercompany-loans/06-tp-documentation]] |

## Rezervy + Opravné Položky (5 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| zákonná rezerva na opravy DHM, § 7 + § 7a | [[50-scenarios/rezervy-OP/01-zakonne-rezervy]] |
| účetní rezervy (dovolená/bonusy/spory) | [[50-scenarios/rezervy-OP/02-ucetni-rezervy]] |
| OP pohledávky § 8a (18mo/30mo) | [[50-scenarios/rezervy-OP/04-OP-pohledavky]] |
| OP zásoby účetní | [[50-scenarios/rezervy-OP/05-OP-zasoby]] |
| daňová uznatelnost rezerv a OP | [[50-scenarios/rezervy-OP/03-danova-uznatelnost]] |

## DHM / Lease / Real Estate (5 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| pořízení DHM nad 80k, daňová hranice | [[50-scenarios/DHM-lifecycle/01-porizeni-DHM]] |
| technické zhodnocení vs oprava | [[50-scenarios/DHM-lifecycle/technicke-zhodnoceni]] |
| odpisy DHM/DNM lineární vs zrychlené | [[50-scenarios/DHM-lifecycle/depreciation-methods]] |
| finanční vs operativní leasing | [[50-scenarios/leases/01-operativní-vs-finanční]] |
| stavební pozemek § 56a trigger | [[80-advisor-pack/RED-07-stavební-pozemek-trigger]] |

## Foreign Trade / FX / Holdingy (5 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| INTRASTAT prahy 2026 | [[50-scenarios/intracom-foreign-trade/04-INTRASTAT]] |
| call-off stock § 18a | [[50-scenarios/intracom-foreign-trade/02-call-off-stock]] |
| dovoz/vývoz 3rd country, JSD | [[50-scenarios/intracom-foreign-trade/05-3rd-country]] |
| kurzové rozdíly účtování + daň | [[50-scenarios/FX/03-kurzove-rozdily-zaplaceni]] + [[50-scenarios/FX/07-danove-dopady]] |
| holdingy dividendy PSD § 19 osvobození | [[50-scenarios/intercompany-loans/07-dividends-PSD]] + [[80-advisor-pack/RED-01-PSD-holding-period]] |

## Neziskové organizace — spolek / ústav / nadace (504/2002) (8 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| spolek/nezisková účtová osnova, 504/2002 vs 500/2002, vlastní jmění/fondy účet | [[20-coa/non-profits-addendum]] |
| účet 901/911/931/932/963 neziskovka, základní kapitál spolku (neexistuje) | [[20-coa/non-profits-addendum]] |
| přijatá dotace účtování (346/384/691), uvolnění dotace do výnosů | [[40-workflows/playbooks/nonprofit-dotace-cycle]] |
| přijatý dar nezisková (682 vs fond 911) | [[40-workflows/playbooks/nonprofit-received-donation]] |
| poskytnutý dar/darovací smlouva neziskovkou (582) | [[40-workflows/playbooks/nonprofit-outbound-grant]] |
| DPPO veřejně prospěšný poplatník, §17a/18a/20-7, spolek daň z příjmů | [[40-workflows/playbooks/nonprofit-dppo-vpp]] |
| uzávěrka neziskovky, závěrka spolku 963→931→932 | [[20-coa/non-profits-addendum]] (§ year-end close) |
| náhrada výdajů funkcionáři spolku (379, ne 335/365) | [[20-coa/non-profits-addendum]] |
| identifikovaná osoba, reverse charge na přijaté zahraniční služby (ERIC, SaaS, platformy), §6h, neplátce self-assess DPH | [[40-workflows/playbooks/nonprofit-identifikovana-osoba]] |

## Insolvence / Likvidace (3 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| insolvence povinnosti účetní jednotky | [[50-scenarios/insolvence/03-debtor-accounting-during-insolvence]] (low-confidence flags) |
| likvidace daňové dopady | [[50-scenarios/likvidace/07-zdaneni-likvidacniho-zustatku]] |
| likvidace vs konkurz rozdíl | [[50-scenarios/likvidace/08-likvidace-vs-konkurz-distinction]] |

## Deadlines + Penalties (3 Q patterns)

| Q pattern keywords | Canonical file |
|---|---|
| daň z nemovitostí 2026 | [[60-deadlines-penalties/dan-z-nemovitosti-2026]] |
| filing deadlines kalendář | [[60-deadlines-penalties/filing-deadlines]] |
| penalty matrix § 250/251/252 DŘ + § 101h/i ZDPH | [[60-deadlines-penalties/penalty-matrix]] |

## Account lookup / Rozvaha / VZZ (always fast — single index)

| Q pattern | Canonical file |
|---|---|
| "Where in Rozvaha is account X?" | [[INDEX-by-account]] (search account number) |
| "Which accounts contribute to row Y?" | [[INDEX-by-rozvaha-row]] |
| "Where in VZZ is náklad/výnos X?" | [[INDEX-by-vzz-row]] |
| "What is account NNN?" | [[INDEX-by-account]] (column name_cz + canonical_file ref) |

## Czech term definitions (always fast — single glossary)

| Q pattern | Canonical file |
|---|---|
| "Co je [czech term]?" / "What is reklasifikace/zápočet/předkontace?" | [[GLOSSARY]] |

## Source authority lookup

| Q pattern | Canonical file |
|---|---|
| "Co je Tier A/B/C source?" / "Which sources allowed?" | [[source-register]] |

## Advisor briefs

| Q pattern | Where |
|---|---|
| "Open advisor questions" | [[80-advisor-pack/README]] |
| "What's confidence: low in KB?" | [[_state/OPEN-QUESTIONS-PRIORITY]] |

---

## Fall-through logic for unmatched Qs

When no pattern matches above:

```
1. Try Grep on /50-scenarios/ for scenario-specific Qs
2. Try Grep on /40-workflows/ for process Qs
3. Try Grep on /20-coa/ for account Qs
4. Try Grep on /80-advisor-pack/ for edge cases
5. Try Grep on /10-foundations/ for legal-basis Qs
6. If still nothing → user clarification needed
```

**Cost discipline:** if pattern matched above → 1-2 calls + answer. If fall-through → up to 5 calls (signals KB gap, log as Wave 8 candidate).

---

## Maintenance

Add new Q patterns here as they emerge. Wave 7 baseline: 60 patterns. REM 2025 stress test (2026-06-04) added 8 non-profit patterns = 68 total. Target Wave 8 (post-advisor): 100+ patterns.

When a playbook for a Q pattern doesn't exist yet, link to closest workflow file + add `(playbook pending)` annotation.

## Known gaps from Wave 7 audit (S2)

| Gap | Status | Wave 8 playbook target |
|---|---|---|
| Reklasifikace pohledávky generic (not jednatel-specific) | Listed above — file pending | [[playbooks/reklasifikace-pohledavky-generic]] |
| R&D capitalization (012 vs 5xx) | Wave 6 covers deduction, accounting decision missing | [[playbooks/rd-cost-capitalization]] |
| DPFO zálohy OSVČ first-year | Partial coverage | [[playbooks/dpfo-zalohy-osvc-firstyear]] |
| § 79 ZDPH de-registration | Missing (only § 42a/74a present) | [[playbooks/dph-deregistration-§79]] |

---

> Built by Wave 7 SYN from session experience + [[W7S2-coverage-gaps]] + [[W7S5-haiku-simulation]]. 60 Q patterns mapped. Target retrieval: <2k tokens for matched Qs.
