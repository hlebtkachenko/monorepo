# Accounting Records System — Entity-Relationship and System Reference

Decision record: [ADR-0025](../adr/0025-accounting-records-system.md)  
Domain package: `packages/accounting` (`@workspace/accounting`)  
Migrations: `packages/db/migrations/0024` – `0028`  
Legal basis: zákon č. 563/1991 Sb. (znění od 1. 1. 2026) + zákon č. 586/1992 Sb. §7b ZDP

---

## (a) Overview and the three regimes

The system records accounting transactions and produces legally required books and period outputs
for three Czech bookkeeping regimes:

| Regime                | Enum value        | Legal basis          | Posting-line table    | Period output       |
| --------------------- | ----------------- | -------------------- | --------------------- | ------------------- |
| Podvojné účetnictví   | `PODVOJNE`        | §13 zák. č. 563/1991 | `zapis_radek`         | `ZAVERKA` (§18)     |
| Jednoduché účetnictví | `JEDNODUCHE`      | §13b                 | `penezni_denik_radek` | `PREHLEDY` (§13b/3) |
| Daňová evidence       | `DANOVA_EVIDENCE` | §7b ZDP              | `penezni_denik_radek` | `DPFO` (§7b)        |

All three regimes share one capture pipeline: `ucetni_pripad` → `ucetni_doklad` → `doklad_radek`
→ `dilci_zaznam`. After capture the flow branches on `ucetni_jednotka.regime`:

```
ucetni_pripad (fact)
  └── ucetni_doklad (source document)
        └── doklad_radek (document line)
              └── dilci_zaznam (money decomposition — pre-posting)
                        │  Zaúčtování (§6/2)
                        ▼
                  ucetni_zapis (shared posting header)
                        │  branches on regime
              ┌─────────┴──────────────┐
              ▼                        ▼
    PODVOJNE                JEDNODUCHE / DANOVA_EVIDENCE
    zapis_radek (MD/Dal)    penezni_denik_radek (cash-book row)
    → ucet → uctovy_rozvrh  → kategorie (optional)
              │                        │
              ▼                        ▼
    v_denik, v_hlavni_kniha    v_penezni_denik
    → ZAVERKA                  → PREHLEDY / DPFO
```

---

## (b) Entity-relationship

### Enums

Defined in `packages/db/src/schema/_enums.ts`, mirroring SQL types from migration 0024.

| SQL type                  | Values                                       |
| ------------------------- | -------------------------------------------- |
| `accounting_regime`       | `PODVOJNE`, `JEDNODUCHE`, `DANOVA_EVIDENCE`  |
| `ucetni_obdobi_typ`       | `kalendar`, `hospodarsky`                    |
| `ucetni_obdobi_stav`      | `otevreno`, `uzavreno`                       |
| `ucetni_doklad_typ`       | `FP`, `FV`, `BV`, `ID`, `pokladni`, `sberny` |
| `dilci_druh`              | `zaklad`, `dph`, `zaokr`                     |
| `ucetni_zapis_druh`       | `jednoduchy`, `slozeny`                      |
| `ucetni_zapis_oprava_typ` | `storno`, `doplnkovy`                        |
| `zapis_strana`            | `MD`, `D`                                    |
| `ucet_typ`                | `A`, `P`, `N`, `V`, `podrozvahovy`           |
| `penezni_denik_misto`     | `hotovost`, `banka`                          |
| `penezni_denik_smer`      | `prijem`, `vydaj`                            |
| `vystup_typ`              | `ZAVERKA`, `PREHLEDY`, `DPFO`                |
| `podpis_typ`              | `za_pripad`, `za_zauctovani`                 |
| `kategorie_typ`           | `prijem`, `vydaj`                            |

### Shared capture core

#### `ucetni_jednotka` — the accounting unit / tenant (§1, §4)

Migration: 0024

| Column            | Type                | Null     | Notes                                        |
| ----------------- | ------------------- | -------- | -------------------------------------------- |
| `id`              | `uuid`              | NOT NULL | PK; `DEFAULT uuidv7()`                       |
| `organization_id` | `uuid`              | NOT NULL | FK → `organization(id)`; UNIQUE (strict 1:1) |
| `regime`          | `accounting_regime` | NOT NULL |                                              |
| `nazev`           | `text`              | NOT NULL |                                              |
| `ico`             | `varchar(16)`       | NULL     |                                              |
| `platce_dph`      | `boolean`           | NOT NULL | DEFAULT false                                |
| `created_at`      | `timestamptz`       | NOT NULL |                                              |
| `updated_at`      | `timestamptz`       | NOT NULL |                                              |

Unique constraints: `(id, organization_id)` — composite FK target for child tables; `(id, organization_id, regime)` — composite FK target for `ucetni_zapis`.

#### `ucetni_obdobi` — accounting period (§3/2, §17)

Migration: 0024

| Column            | Type                 | Null     | Notes                                                 |
| ----------------- | -------------------- | -------- | ----------------------------------------------------- |
| `id`              | `uuid`               | NOT NULL | PK                                                    |
| `organization_id` | `uuid`               | NOT NULL |                                                       |
| `jednotka_id`     | `uuid`               | NOT NULL | composite FK → `ucetni_jednotka(id, organization_id)` |
| `typ`             | `ucetni_obdobi_typ`  | NOT NULL |                                                       |
| `od`              | `date`               | NOT NULL |                                                       |
| `do`              | `date`               | NOT NULL | CHECK `od <= do`                                      |
| `stav`            | `ucetni_obdobi_stav` | NOT NULL | DEFAULT `otevreno`                                    |
| `created_at`      | `timestamptz`        | NOT NULL |                                                       |
| `updated_at`      | `timestamptz`        | NOT NULL |                                                       |

#### `ucetni_pripad` — the economic fact (§6/1)

Migration: 0024. Not a record in the statutory sense; it is the real-world event that documents and postings refer to.

| Column              | Type          | Null     | Notes                                                 |
| ------------------- | ------------- | -------- | ----------------------------------------------------- |
| `id`                | `uuid`        | NOT NULL | PK                                                    |
| `organization_id`   | `uuid`        | NOT NULL |                                                       |
| `jednotka_id`       | `uuid`        | NOT NULL | composite FK → `ucetni_jednotka(id, organization_id)` |
| `protistrana_id`    | `uuid`        | NULL     | composite FK → `protistrana(id, organization_id)`     |
| `popis`             | `text`        | NOT NULL | obsah účetního případu (§11/1b)                       |
| `datum_uskutecneni` | `date`        | NOT NULL | §11/1e                                                |
| `typ`               | `text`        | NULL     | free-text classifier                                  |
| `created_at`        | `timestamptz` | NOT NULL |                                                       |
| `updated_at`        | `timestamptz` | NOT NULL |                                                       |

#### `ucetni_doklad` — source document / voucher (§11)

Migration: 0024. `oznaceni` is the číselná řada, unique per `(organization_id, obdobi_id, typ)`.

| Column               | Type                | Null     | Notes                                                 |
| -------------------- | ------------------- | -------- | ----------------------------------------------------- |
| `id`                 | `uuid`              | NOT NULL | PK                                                    |
| `organization_id`    | `uuid`              | NOT NULL |                                                       |
| `jednotka_id`        | `uuid`              | NOT NULL | composite FK → `ucetni_jednotka(id, organization_id)` |
| `obdobi_id`          | `uuid`              | NOT NULL | composite FK → `ucetni_obdobi(id, organization_id)`   |
| `protistrana_id`     | `uuid`              | NULL     | composite FK → `protistrana(id, organization_id)`     |
| `typ`                | `ucetni_doklad_typ` | NOT NULL |                                                       |
| `oznaceni`           | `text`              | NOT NULL | UNIQUE `(organization_id, obdobi_id, typ, oznaceni)`  |
| `okamzik_vyhotoveni` | `timestamptz`       | NOT NULL | §11/1d                                                |
| `created_at`         | `timestamptz`       | NOT NULL |                                                       |
| `updated_at`         | `timestamptz`       | NOT NULL |                                                       |

BEFORE INSERT trigger `ucetni_doklad_reject_closed_period` rejects inserts when `obdobi_id.stav = 'uzavreno'` (R12).

#### `doklad_radek` — document line / jednotlivý záznam (§4/11)

Migration: 0024. One line documents one `ucetni_pripad`.

| Column            | Type            | Null     | Notes                                               |
| ----------------- | --------------- | -------- | --------------------------------------------------- |
| `id`              | `uuid`          | NOT NULL | PK                                                  |
| `organization_id` | `uuid`          | NOT NULL |                                                     |
| `doklad_id`       | `uuid`          | NOT NULL | composite FK → `ucetni_doklad(id, organization_id)` |
| `pripad_id`       | `uuid`          | NOT NULL | composite FK → `ucetni_pripad(id, organization_id)` |
| `popis`           | `text`          | NULL     |                                                     |
| `castka`          | `numeric(19,4)` | NOT NULL |                                                     |
| `created_at`      | `timestamptz`   | NOT NULL |                                                     |
| `updated_at`      | `timestamptz`   | NOT NULL |                                                     |

#### `dilci_zaznam` — money decomposition, pre-posting (§33/5)

Migration: 0024. Decomposes a `doklad_radek` amount into base/VAT/rounding before posting.

| Column            | Type            | Null     | Notes                                              |
| ----------------- | --------------- | -------- | -------------------------------------------------- |
| `id`              | `uuid`          | NOT NULL | PK                                                 |
| `organization_id` | `uuid`          | NOT NULL |                                                    |
| `doklad_radek_id` | `uuid`          | NOT NULL | composite FK → `doklad_radek(id, organization_id)` |
| `druh`            | `dilci_druh`    | NOT NULL | `zaklad` / `dph` / `zaokr`                         |
| `castka`          | `numeric(19,4)` | NOT NULL |                                                    |
| `dph_sazba`       | `numeric(5,2)`  | NULL     | VAT rate                                           |
| `dph_castka`      | `numeric(19,4)` | NULL     | VAT amount                                         |
| `created_at`      | `timestamptz`   | NOT NULL |                                                    |
| `updated_at`      | `timestamptz`   | NOT NULL |                                                    |

### Posting layer

#### `ucetni_zapis` — the posting / accounting entry (§12)

Migration: 0025. Shared header for all regimes. For DANOVA_EVIDENCE this is a technical container, not a legal účetní zápis (§7b ZDP). Append-only (R8). No `updated_at`.

| Column               | Type                      | Null     | Notes                                                                                                  |
| -------------------- | ------------------------- | -------- | ------------------------------------------------------------------------------------------------------ |
| `id`                 | `uuid`                    | NOT NULL | PK                                                                                                     |
| `organization_id`    | `uuid`                    | NOT NULL |                                                                                                        |
| `jednotka_id`        | `uuid`                    | NOT NULL | 3-col composite FK → `ucetni_jednotka(id, organization_id, regime)` — enforces regime match            |
| `obdobi_id`          | `uuid`                    | NOT NULL | composite FK → `ucetni_obdobi(id, organization_id)`                                                    |
| `doklad_id`          | `uuid`                    | NOT NULL | composite FK → `ucetni_doklad(id, organization_id)`                                                    |
| `pripad_id`          | `uuid`                    | NOT NULL | composite FK → `ucetni_pripad(id, organization_id)`                                                    |
| `odpisovy_plan_id`   | `uuid`                    | NULL     | composite FK → `odpisovy_plan(id, organization_id)`                                                    |
| `inventura_id`       | `uuid`                    | NULL     | composite FK → `inventurni_soupis(id, organization_id)`                                                |
| `opravuje_zapis_id`  | `uuid`                    | NULL     | composite self-FK → `ucetni_zapis(id, organization_id)`; set iff `oprava_typ` is set                   |
| `oprava_typ`         | `ucetni_zapis_oprava_typ` | NULL     | `storno` or `doplnkovy` (ČÚS 001); CHECK: both NULL or both non-NULL together with `opravuje_zapis_id` |
| `datum`              | `date`                    | NOT NULL |                                                                                                        |
| `regime`             | `accounting_regime`       | NOT NULL | Immutable after insert (R8 triggers)                                                                   |
| `druh`               | `ucetni_zapis_druh`       | NOT NULL | `jednoduchy` (2 lines) / `slozeny` (>2 lines)                                                          |
| `odpovedna_osoba`    | `uuid`                    | NOT NULL | FK → `app_user(id)` (R10)                                                                              |
| `okamzik_zauctovani` | `timestamptz`             | NOT NULL |                                                                                                        |
| `created_at`         | `timestamptz`             | NOT NULL |                                                                                                        |

Unique constraints: `(id, organization_id)` and `(id, organization_id, regime)` — composite FK targets for line tables.

BEFORE INSERT trigger `ucetni_zapis_reject_closed_period` rejects inserts when `obdobi_id.stav = 'uzavreno'` (R12).

Deferred constraint trigger `ucetni_zapis_balanced` (DEFERRABLE INITIALLY DEFERRED): for `regime = 'PODVOJNE'`, asserts `count(zapis_radek) >= 1` and `SUM(MD) = SUM(D)` at COMMIT (R4).

BEFORE UPDATE/DELETE/TRUNCATE triggers block all mutations (R8).

#### `zapis_radek` — double-entry posting line (§13/2), PODVOJNE only

Migration: 0025. The posted form of a `dilci_zaznam` for PODVOJNE. `castka` may be negative (storno). Append-only (R8).

| Column            | Type                | Null     | Notes                                                                                                                    |
| ----------------- | ------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------ |
| `id`              | `uuid`              | NOT NULL | PK                                                                                                                       |
| `organization_id` | `uuid`              | NOT NULL |                                                                                                                          |
| `zapis_id`        | `uuid`              | NOT NULL | 3-col composite FK → `ucetni_zapis(id, organization_id, regime)`                                                         |
| `regime`          | `accounting_regime` | NOT NULL | CHECK `regime = 'PODVOJNE'`                                                                                              |
| `ucet_id`         | `uuid`              | NOT NULL | composite FK → `ucet(id, organization_id)`                                                                               |
| `dilci_id`        | `uuid`              | NULL     | composite FK → `dilci_zaznam(id, organization_id)`; NULL for generated postings (opening balances, depreciation, storno) |
| `strana`          | `zapis_strana`      | NOT NULL | `MD` or `D`                                                                                                              |
| `castka`          | `numeric(19,4)`     | NOT NULL |                                                                                                                          |
| `created_at`      | `timestamptz`       | NOT NULL |                                                                                                                          |

Deferred constraint trigger `zapis_radek_balanced`: re-checks balance of its parent `ucetni_zapis` at COMMIT (R4). BEFORE UPDATE/DELETE/TRUNCATE triggers block mutations (R8).

#### `penezni_denik_radek` — cash-book posting line (§13b / §7b), JEDNODUCHE and DANOVA_EVIDENCE

Migration: 0025. Classified cash-book row. One cash movement may produce multiple rows (multiple categories, průběžné položky, VAT split). Append-only (R8).

| Column            | Type                  | Null     | Notes                                                            |
| ----------------- | --------------------- | -------- | ---------------------------------------------------------------- |
| `id`              | `uuid`                | NOT NULL | PK                                                               |
| `organization_id` | `uuid`                | NOT NULL |                                                                  |
| `zapis_id`        | `uuid`                | NOT NULL | 3-col composite FK → `ucetni_zapis(id, organization_id, regime)` |
| `regime`          | `accounting_regime`   | NOT NULL | CHECK `regime IN ('JEDNODUCHE', 'DANOVA_EVIDENCE')`              |
| `dilci_id`        | `uuid`                | NULL     | composite FK → `dilci_zaznam(id, organization_id)`               |
| `kategorie_id`    | `uuid`                | NULL     | composite FK → `kategorie(id, organization_id)`                  |
| `misto`           | `penezni_denik_misto` | NOT NULL | `hotovost` / `banka`                                             |
| `smer`            | `penezni_denik_smer`  | NOT NULL | `prijem` / `vydaj`                                               |
| `danovy`          | `boolean`             | NOT NULL | daňový vs nedaňový                                               |
| `prubezny`        | `boolean`             | NOT NULL | DEFAULT false; průběžná položka (own-account transfer)           |
| `zaklad_dane`     | `numeric(19,4)`       | NULL     | tax base (excludes pass-through VAT)                             |
| `castka`          | `numeric(19,4)`       | NOT NULL |                                                                  |
| `created_at`      | `timestamptz`         | NOT NULL |                                                                  |

BEFORE UPDATE/DELETE/TRUNCATE triggers block mutations (R8).

### Chart of accounts

#### `uctovy_rozvrh` — chart of accounts (§14, §13/3)

Migration: 0025. One chart per accounting unit per year.

| Column            | Type          | Null     | Notes                                                 |
| ----------------- | ------------- | -------- | ----------------------------------------------------- |
| `id`              | `uuid`        | NOT NULL | PK                                                    |
| `organization_id` | `uuid`        | NOT NULL |                                                       |
| `jednotka_id`     | `uuid`        | NOT NULL | composite FK → `ucetni_jednotka(id, organization_id)` |
| `rok`             | `smallint`    | NOT NULL | UNIQUE `(organization_id, rok)`                       |
| `created_at`      | `timestamptz` | NOT NULL |                                                       |
| `updated_at`      | `timestamptz` | NOT NULL |                                                       |

#### `ucet` — account (§14, §16)

Migration: 0025. Analytical accounts reference their synthetic parent via `parent_id`. No `jednotka_id` column — tenancy flows through `organization_id` from the chart.

| Column            | Type          | Null     | Notes                                                                                 |
| ----------------- | ------------- | -------- | ------------------------------------------------------------------------------------- |
| `id`              | `uuid`        | NOT NULL | PK                                                                                    |
| `organization_id` | `uuid`        | NOT NULL |                                                                                       |
| `rozvrh_id`       | `uuid`        | NOT NULL | composite FK → `uctovy_rozvrh(id, organization_id)`                                   |
| `parent_id`       | `uuid`        | NULL     | composite FK → `ucet(id, rozvrh_id)` — must be in same chart; CHECK `parent_id <> id` |
| `cislo`           | `text`        | NOT NULL | UNIQUE `(rozvrh_id, cislo)`                                                           |
| `trida`           | `smallint`    | NOT NULL | account class (1–9)                                                                   |
| `typ`             | `ucet_typ`    | NOT NULL | `A` / `P` / `N` / `V` / `podrozvahovy`                                                |
| `created_at`      | `timestamptz` | NOT NULL |                                                                                       |
| `updated_at`      | `timestamptz` | NOT NULL |                                                                                       |

### Supporting records

#### `odpisovy_plan` — depreciation plan (§4/11)

Migration: 0025. Generates monthly depreciation postings (UC-4).

| Column            | Type            | Null     | Notes                                                 |
| ----------------- | --------------- | -------- | ----------------------------------------------------- |
| `id`              | `uuid`          | NOT NULL | PK                                                    |
| `organization_id` | `uuid`          | NOT NULL |                                                       |
| `jednotka_id`     | `uuid`          | NOT NULL | composite FK → `ucetni_jednotka(id, organization_id)` |
| `majetek_id`      | `uuid`          | NOT NULL | composite FK → `majetek(id, organization_id)`         |
| `metoda`          | `text`          | NOT NULL | depreciation method                                   |
| `mesicni_castka`  | `numeric(19,4)` | NOT NULL |                                                       |
| `created_at`      | `timestamptz`   | NOT NULL |                                                       |
| `updated_at`      | `timestamptz`   | NOT NULL |                                                       |

#### `inventurni_soupis` — inventory list (§30)

Migration: 0025. Differences (manko/přebytek) generate adjustment postings (UC-4).

| Column            | Type          | Null     | Notes                                                 |
| ----------------- | ------------- | -------- | ----------------------------------------------------- |
| `id`              | `uuid`        | NOT NULL | PK                                                    |
| `organization_id` | `uuid`        | NOT NULL |                                                       |
| `jednotka_id`     | `uuid`        | NOT NULL | composite FK → `ucetni_jednotka(id, organization_id)` |
| `datum`           | `date`        | NOT NULL |                                                       |
| `created_at`      | `timestamptz` | NOT NULL |                                                       |
| `updated_at`      | `timestamptz` | NOT NULL |                                                       |

### Output

#### `vystup` — period output marker (§18 / §13b/3 / §7b)

Migration: 0025. Records that output was generated for a period. Figures are derived (R9), never stored here. UNIQUE `(organization_id, obdobi_id, typ)` — one marker per period per output type.

| Column            | Type          | Null     | Notes                                                 |
| ----------------- | ------------- | -------- | ----------------------------------------------------- |
| `id`              | `uuid`        | NOT NULL | PK                                                    |
| `organization_id` | `uuid`        | NOT NULL |                                                       |
| `jednotka_id`     | `uuid`        | NOT NULL | composite FK → `ucetni_jednotka(id, organization_id)` |
| `obdobi_id`       | `uuid`        | NOT NULL | composite FK → `ucetni_obdobi(id, organization_id)`   |
| `typ`             | `vystup_typ`  | NOT NULL | `ZAVERKA` / `PREHLEDY` / `DPFO`                       |
| `created_at`      | `timestamptz` | NOT NULL |                                                       |

#### `podpis` — signature record (§33a/4)

Migration: 0025. Links to exactly one of `ucetni_doklad` or `ucetni_zapis`. CHECK `(doklad_id IS NOT NULL) <> (zapis_id IS NOT NULL)`.

| Column            | Type          | Null     | Notes                                               |
| ----------------- | ------------- | -------- | --------------------------------------------------- |
| `id`              | `uuid`        | NOT NULL | PK                                                  |
| `organization_id` | `uuid`        | NOT NULL |                                                     |
| `doklad_id`       | `uuid`        | NULL     | composite FK → `ucetni_doklad(id, organization_id)` |
| `zapis_id`        | `uuid`        | NULL     | composite FK → `ucetni_zapis(id, organization_id)`  |
| `typ`             | `podpis_typ`  | NOT NULL | `za_pripad` / `za_zauctovani`                       |
| `podepsal`        | `uuid`        | NOT NULL | FK → `app_user(id)`                                 |
| `okamzik`         | `timestamptz` | NOT NULL |                                                     |
| `created_at`      | `timestamptz` | NOT NULL |                                                     |

### External lookup stubs (§5.7 — name and PK only, not developed in MVP)

All three tables are organization-scoped (FORCE RLS). They do not carry `jednotka_id`.

#### `protistrana` — counterparty

| Column            | Type          | Null        |
| ----------------- | ------------- | ----------- |
| `id`              | `uuid`        | NOT NULL PK |
| `organization_id` | `uuid`        | NOT NULL    |
| `nazev`           | `text`        | NULL        |
| `created_at`      | `timestamptz` | NOT NULL    |

#### `majetek` — fixed asset

| Column            | Type          | Null        |
| ----------------- | ------------- | ----------- |
| `id`              | `uuid`        | NOT NULL PK |
| `organization_id` | `uuid`        | NOT NULL    |
| `nazev`           | `text`        | NULL        |
| `created_at`      | `timestamptz` | NOT NULL    |

#### `kategorie` — income/expense category for peněžní deník (§9)

| Column            | Type            | Null                          |
| ----------------- | --------------- | ----------------------------- |
| `id`              | `uuid`          | NOT NULL PK                   |
| `organization_id` | `uuid`          | NOT NULL                      |
| `typ`             | `kategorie_typ` | NOT NULL (`prijem` / `vydaj`) |
| `nazev`           | `text`          | NOT NULL                      |
| `created_at`      | `timestamptz`   | NOT NULL                      |

Note: `kategorie` has `typ` and `nazev` — it is not a bare PK stub. `protistrana` and `majetek` are bare name + PK stubs.

---

## (c) The five views

All views are defined in migration 0028 with `WITH (security_invoker = on)`. The querying role's
RLS policies apply — `app_user` sees only its own organization's rows. All PODVOJNE views
filter `z.regime = 'PODVOJNE'`; `v_penezni_denik` filters `regime IN ('JEDNODUCHE', 'DANOVA_EVIDENCE')`.
`app_user` receives `GRANT SELECT` on all five views.

### `v_denik` — journal, postings in chronological order (PODVOJNE, §13)

Returns one row per `zapis_radek`. Ordered by `datum, zapis_id, zapis_radek_id`.

| Column            | Source                            |
| ----------------- | --------------------------------- |
| `organization_id` | `zapis_radek.organization_id`     |
| `zapis_id`        | `ucetni_zapis.id`                 |
| `datum`           | `ucetni_zapis.datum`              |
| `doklad_id`       | `ucetni_zapis.doklad_id`          |
| `doklad_typ`      | `ucetni_doklad.typ`               |
| `doklad_oznaceni` | `ucetni_doklad.oznaceni`          |
| `pripad_id`       | `ucetni_zapis.pripad_id`          |
| `zapis_radek_id`  | `zapis_radek.id`                  |
| `ucet_id`         | `zapis_radek.ucet_id`             |
| `ucet_cislo`      | `ucet.cislo`                      |
| `strana`          | `zapis_radek.strana` (`MD` / `D`) |
| `castka`          | `zapis_radek.castka`              |

### `v_hlavni_kniha` — general ledger, balances by account (PODVOJNE, §13)

Returns one row per `ucet` that has at least one posting. `zustatek = md_total - d_total`.

| Column            | Notes                                |
| ----------------- | ------------------------------------ |
| `organization_id` |                                      |
| `ucet_id`         |                                      |
| `ucet_cislo`      |                                      |
| `ucet_typ`        |                                      |
| `parent_id`       |                                      |
| `md_total`        | `SUM(castka) FILTER (strana = 'MD')` |
| `d_total`         | `SUM(castka) FILTER (strana = 'D')`  |
| `zustatek`        | `md_total - d_total`                 |

### `v_kniha_analytickych_uctu` — book of analytical accounts (PODVOJNE, §16)

Subset of `v_hlavni_kniha` where `ucet.parent_id IS NOT NULL`. Includes `synteticky_ucet_id` (= `ucet.parent_id`). No `ucet_typ` column.

### `v_kniha_podrozvahovych_uctu` — book of off-balance accounts (PODVOJNE, §13)

Subset of `v_hlavni_kniha` where `ucet.typ = 'podrozvahovy'`. Returns `ucet_id`, `ucet_cislo`, `md_total`, `d_total`. No `zustatek` column.

### `v_penezni_denik` — cash journal (JEDNODUCHE / DANOVA_EVIDENCE)

Returns one row per `penezni_denik_radek`. Ordered by `datum, zapis_id`.

| Column            | Source                                                |
| ----------------- | ----------------------------------------------------- |
| `organization_id` | `penezni_denik_radek.organization_id`                 |
| `zapis_id`        | `ucetni_zapis.id`                                     |
| `datum`           | `ucetni_zapis.datum`                                  |
| `regime`          | `ucetni_zapis.regime`                                 |
| `doklad_id`       | `ucetni_zapis.doklad_id`                              |
| `radek_id`        | `penezni_denik_radek.id`                              |
| `misto`           | `penezni_denik_radek.misto`                           |
| `smer`            | `penezni_denik_radek.smer`                            |
| `danovy`          | `penezni_denik_radek.danovy`                          |
| `prubezny`        | `penezni_denik_radek.prubezny`                        |
| `kategorie_id`    | `penezni_denik_radek.kategorie_id` (NULL when absent) |
| `kategorie_typ`   | `kategorie.typ` (NULL when absent)                    |
| `kategorie_nazev` | `kategorie.nazev` (NULL when absent)                  |
| `zaklad_dane`     | `penezni_denik_radek.zaklad_dane`                     |
| `castka`          | `penezni_denik_radek.castka`                          |

---

## (d) Invariant map (R1–R13)

| Rule | Requirement                                                                                       | Enforcement mechanism                                                                                                 | File / migration                   |
| ---- | ------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| R1   | No orphan posting line; `zapis_radek` must have a valid `ucet_id` and `zapis_id`                  | NOT NULL FKs                                                                                                          | 0025                               |
| R2   | Every `ucetni_zapis` must reference a `doklad_id` and a `pripad_id`                               | NOT NULL FKs                                                                                                          | 0025                               |
| R3   | `ucetni_doklad` must have mandatory fields, a unique číselná řada (§11/1a), and ≥1 `doklad_radek` | `UNIQUE(organization_id, obdobi_id, typ, oznaceni)`; `doklad_radek` NOT NULL FKs; MVP: `podpis` rows for signatures   | 0024; `capture.ts`                 |
| R4   | PODVOJNE: `SUM(MD) = SUM(Dal)` and ≥1 `zapis_radek` per `ucetni_zapis`                            | Deferred constraint trigger `ucetni_zapis_balanced` + `zapis_radek_balanced` (fires at COMMIT)                        | 0027                               |
| R5   | Analytical accounts sum equals synthetic (§16)                                                    | Service-layer query `reconcileAnalytics()`                                                                            | `invariants.ts`                    |
| R6   | All period cases fully posted before output                                                       | Service-layer gate `unpostedCases()` inside `generateOutput()`                                                        | `invariants.ts`, `output/index.ts` |
| R7   | PODVOJNE uses `zapis_radek`; JEDNODUCHE/DANOVA_EVIDENCE use `penezni_denik_radek`                 | CHECK constraints on each line table + 3-col composite FK to `ucetni_zapis(id, organization_id, regime)`              | 0025                               |
| R8   | Posted entries are append-only; corrections are new rows                                          | BEFORE UPDATE/DELETE row triggers + BEFORE TRUNCATE triggers on `ucetni_zapis`, `zapis_radek`, `penezni_denik_radek`  | 0027                               |
| R9   | `vystup` figures derived from ledger/peněžní-deník balances, never hand-entered                   | `buildZaverka / buildPrehledy / buildDpfo` compute via SQL `SUM`; `vystup` table stores only a marker                 | `output/`                          |
| R10  | Every doklad/posting attributable to a responsible person                                         | `odpovedna_osoba uuid NOT NULL REFERENCES app_user(id)` on `ucetni_zapis`; `podpis` rows for document signatures      | 0025                               |
| R11  | Bidirectional audit trail from output → account → posting → document → case and back              | `traceAccount(ucetId)` and `tracePripad(pripadId)` queries                                                            | `invariants.ts`                    |
| R12  | Closed period rejects new postings; opening balances are postings against 701                     | BEFORE INSERT triggers on `ucetni_zapis` and `ucetni_doklad`; `openNextPeriod()` generates opening `zapis_radek` rows | 0027; `period.ts`                  |
| R13  | All amounts exact decimal; no float; CZK only for MVP                                             | `numeric(19,4)` SQL columns; TypeScript `Decimal = string`; all sums in SQL                                           | 0024, 0025; `sql.ts`, `types.ts`   |

---

## (e) Use cases and implementing functions

### UC-1: Record a transaction (all regimes)

| Step | Description                                                                | Function                                                                                                  |
| ---- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| 1    | Create the economic fact                                                   | `createCase(db, ctx, CaseInput)` → `string` (pripad id)                                                   |
| 2    | Capture the source document with lines                                     | `captureDocument(db, ctx, DocumentInput)` → `CapturedDocument`                                            |
| 3    | Money decomposition is captured inline in step 2 via `dilci: DilciInput[]` | (part of `captureDocument`)                                                                               |
| 4    | Post: create `ucetni_zapis` + line rows                                    | `post(db, ctx, PostInput)` → `PostedEntry` (dispatches to `postDoubleEntry` or `postCashEntry` by regime) |

Run all steps inside one `withOrganization` transaction so the R4 deferred trigger fires at COMMIT.

### UC-2: View books

| Function                  | View queried                  | Regime                       |
| ------------------------- | ----------------------------- | ---------------------------- |
| `denik(db)`               | `v_denik`                     | PODVOJNE                     |
| `hlavniKniha(db)`         | `v_hlavni_kniha`              | PODVOJNE                     |
| `knihaAnalytickych(db)`   | `v_kniha_analytickych_uctu`   | PODVOJNE                     |
| `knihaPodrozvahovych(db)` | `v_kniha_podrozvahovych_uctu` | PODVOJNE                     |
| `penezniDenik(db)`        | `v_penezni_denik`             | JEDNODUCHE / DANOVA_EVIDENCE |

### UC-3: Generate period output

`generateOutput(db, ctx, obdobiId)` → `GeneratedOutput`:

1. Checks R6 via `unpostedCases(db, obdobiId)` — throws `UnpostedPeriodError` if any cases remain unposted.
2. Reads regime via `getUnitRegime(db, jednotkaId)`.
3. Calls `buildZaverka` (PODVOJNE), `buildPrehledy` (JEDNODUCHE), or `buildDpfo` (DANOVA_EVIDENCE).
4. Inserts one `vystup` row and returns `{ vystupId, figures }`.

| Builder                       | Output type                                                                                | Source                                                                    |
| ----------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- |
| `buildZaverka(db, obdobiId)`  | `Zaverka` (aktiva/pasiva/naklady/vynosy/vysledek + per-account list)                       | `zapis_radek` via period filter, excludes třída 7                         |
| `buildPrehledy(db, obdobiId)` | `Prehledy` (prijmy_danove, prijmy_nedanove, vydaje_danove, vydaje_nedanove, rozdil_danovy) | `penezni_denik_radek`, regime = JEDNODUCHE, excludes `prubezny` rows      |
| `buildDpfo(db, obdobiId)`     | `Dpfo` (prijmy_danove, vydaje_danove, zaklad_dane)                                         | `penezni_denik_radek`, regime = DANOVA_EVIDENCE, excludes `prubezny` rows |

`zaklad_dane` in PREHLEDY and DPFO uses `COALESCE(zaklad_dane, castka)` — falls back to `castka` when no separate tax base is recorded.

### UC-4: Supporting postings

| Function                                                       | Generates                                                                                                   |
| -------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `generateDepreciation(db, ctx, DepreciationInput)`             | One PODVOJNE posting: MD expense account / D accumulated-depreciation account, linked to `odpisovy_plan_id` |
| `recordInventoryDifference(db, ctx, InventoryDifferenceInput)` | One PODVOJNE posting with caller-supplied balanced lines, linked to `inventura_id`                          |

---

## (f) Public API surface (`packages/accounting/src/index.ts`)

### Types (from `types.ts`)

| Export                 | Description                                          |
| ---------------------- | ---------------------------------------------------- |
| `Regime`               | Union of `accounting_regime` values                  |
| `ObdobiTyp`            | Union of `ucetni_obdobi_typ` values                  |
| `DokladTyp`            | Union of `ucetni_doklad_typ` values                  |
| `DilciDruh`            | Union of `dilci_druh` values                         |
| `UcetTyp`              | Union of `ucet_typ` values                           |
| `Strana`               | `'MD' \| 'D'`                                        |
| `Misto`                | `'hotovost' \| 'banka'`                              |
| `Smer`                 | `'prijem' \| 'vydaj'`                                |
| `KategorieTyp`         | `'prijem' \| 'vydaj'`                                |
| `OpravaTyp`            | `'storno' \| 'doplnkovy'`                            |
| `VystupTyp`            | `'ZAVERKA' \| 'PREHLEDY' \| 'DPFO'`                  |
| `Decimal`              | `string` — exact decimal amount, e.g. `"121.00"`     |
| `UnitCtx`              | `{ organizationId: string; jednotkaId: string }`     |
| `CaseInput`            | Input for `createCase`                               |
| `DilciInput`           | One money decomposition row                          |
| `DocumentLineInput`    | One document line including its `dilci[]`            |
| `DocumentInput`        | Full document capture input                          |
| `CapturedDocument`     | Result of `captureDocument`: dokladId + per-line ids |
| `PostingBase`          | Shared fields for all posting inputs                 |
| `DoubleEntryLineInput` | One MD/Dal line for PODVOJNE                         |
| `DoubleEntryInput`     | Full PODVOJNE posting input                          |
| `CashLineInput`        | One classified cash-book row                         |
| `CashEntryInput`       | Full cash-book posting input                         |
| `PostedEntry`          | `{ zapisId: string; lineIds: string[] }`             |

### Setup (`setup.ts`)

`createUnit`, `createPeriod`, `createChart`, `createAccount`, `createCounterparty`, `createCategory`, `createAsset`, `createDepreciationPlan`, `createInventory`, `recordSignature`

### Capture (`capture.ts`)

`createCase`, `captureDocument`

### Posting (`posting/`)

`post`, `postDoubleEntry`, `postCashEntry`, `getUnitRegime`, `PostInput`

### Books (`books.ts`)

`denik`, `hlavniKniha`, `knihaAnalytickych`, `knihaPodrozvahovych`, `penezniDenik`; types `DenikRow`, `UcetBalanceRow`, `PenezniDenikRow`

### Period (`period.ts`)

`closePeriod`, `openNextPeriod`; types `OpenNextPeriodInput`, `OpenNextPeriodResult`

### Corrections (`corrections.ts`)

`stornoEntry`; type `StornoInput`

### Supporting (`supporting.ts`)

`generateDepreciation`, `recordInventoryDifference`; types `DepreciationInput`, `InventoryDifferenceInput`

### Invariants (`invariants.ts`)

`unpostedCases`, `reconcileAnalytics`, `traceAccount`, `tracePripad`; types `UnpostedCase`, `AnalyticalReconcile`, `TraceRow`, `CasePostingRow`

### Output (`output/`)

`generateOutput`, `buildZaverka`, `buildPrehledy`, `buildDpfo`, `UnpostedPeriodError`; types `GeneratedOutput`, `OutputFigures`, `Zaverka`, `ZaverkaAccount`, `Prehledy`, `Dpfo`
