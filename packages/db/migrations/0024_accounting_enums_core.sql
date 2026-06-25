-- Migration 0024: Accounting Records System (MVP) — enums + shared capture core.
--
-- Encodes the capture pipeline shared by all three CZ bookkeeping regimes
-- (zákon 563/1991 Sb. + §7b ZDP): ucetni_pripad (fact) → ucetni_doklad (voucher)
-- → doklad_radek (line) → dilci_zaznam (money decomposition, pre-posting).
-- Posting tables (ucetni_zapis, zapis_radek, penezni_denik_radek, ...) are in 0025.
-- RLS in 0026, constraint/append-only triggers in 0027, books views in 0028.
--
-- TENANCY (advisor-hardened): the monorepo isolates tenants via FORCE RLS keyed
-- on `app.organization_id`. PostgreSQL FK referential checks BYPASS RLS, so RLS
-- alone cannot stop a child row (org X) from referencing a parent in org Y.
-- Therefore every tenant-scoped table carries `organization_id` AND every
-- tenant-scoped FK is a COMPOSITE `(fk_id, organization_id) → parent(id,
-- organization_id)` (MATCH SIMPLE: nullable FK cols skip the check when NULL).
-- `ucetni_jednotka` is strict 1:1 with `organization` (organization_id UNIQUE),
-- so organization-consistency == accounting-unit-consistency.
--
-- The spec/ERD (`ucetni-system-erd.drawio`) is the canonical structure. Enum
-- literal values follow the spec §5 verbatim (regime uppercase; vystup typ
-- uppercase; the rest lowercase / MD|D / A|P|N|V as written).

BEGIN;

-- 1. Enums --------------------------------------------------------------------

-- Mirrors: packages/db/src/schema/_enums.ts — accountingRegime
CREATE TYPE accounting_regime AS ENUM ('PODVOJNE', 'JEDNODUCHE', 'DANOVA_EVIDENCE');
-- ucetni_obdobi
CREATE TYPE ucetni_obdobi_typ  AS ENUM ('kalendar', 'hospodarsky');
CREATE TYPE ucetni_obdobi_stav AS ENUM ('otevreno', 'uzavreno');
-- ucetni_doklad (FP=faktura přijatá, FV=faktura vydaná, BV=bankovní výpis, ID=interní doklad)
CREATE TYPE ucetni_doklad_typ  AS ENUM ('FP', 'FV', 'BV', 'ID', 'pokladni', 'sberny');
-- dilci_zaznam money decomposition (§33/5)
CREATE TYPE dilci_druh         AS ENUM ('zaklad', 'dph', 'zaokr');
-- ucetni_zapis
CREATE TYPE ucetni_zapis_druh  AS ENUM ('jednoduchy', 'slozeny');
CREATE TYPE ucetni_zapis_oprava_typ AS ENUM ('storno', 'doplnkovy');  -- ČÚS 001 (§35)
-- zapis_radek (§13/2)
CREATE TYPE zapis_strana       AS ENUM ('MD', 'D');
-- ucet (A=aktivní, P=pasivní, N=náklady, V=výnosy, podrozvahovy=off-balance)
CREATE TYPE ucet_typ           AS ENUM ('A', 'P', 'N', 'V', 'podrozvahovy');
-- penezni_denik_radek (§13b / §7b)
CREATE TYPE penezni_denik_misto AS ENUM ('hotovost', 'banka');
CREATE TYPE penezni_denik_smer  AS ENUM ('prijem', 'vydaj');
-- vystup (§18 / §13b/3 / §7b ZDP)
CREATE TYPE vystup_typ         AS ENUM ('ZAVERKA', 'PREHLEDY', 'DPFO');
-- podpis (§33a/4)
CREATE TYPE podpis_typ         AS ENUM ('za_pripad', 'za_zauctovani');
-- kategorie (peněžní deník by-type splits, §9)
CREATE TYPE kategorie_typ      AS ENUM ('prijem', 'vydaj');

-- 2. ucetni_jednotka — the accounting unit / tenant (§1, §4). Strict 1:1 with
--    organization: organization_id is the RLS anchor and is UNIQUE.
CREATE TABLE ucetni_jednotka (
  id               uuid              PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid              NOT NULL UNIQUE REFERENCES organization(id),
  regime           accounting_regime NOT NULL,
  nazev            text              NOT NULL,
  ico              varchar(16),
  platce_dph       boolean           NOT NULL DEFAULT false,
  created_at       timestamptz       NOT NULL DEFAULT now(),
  updated_at       timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT ucetni_jednotka_id_org_unique UNIQUE (id, organization_id),
  -- FK target for ucetni_zapis: forces a posting's regime to equal its unit's.
  CONSTRAINT ucetni_jednotka_id_org_regime_unique UNIQUE (id, organization_id, regime)
);

-- 3. External lookup stubs (§5.7 — name + PK only; do not develop). They hold
--    tenant data so they are organization-scoped for RLS. Per spec §5 intro,
--    external lookups do NOT carry jednotka_id.
CREATE TABLE protistrana (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL REFERENCES organization(id),
  nazev            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT protistrana_id_org_unique UNIQUE (id, organization_id)
);

CREATE TABLE majetek (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL REFERENCES organization(id),
  nazev            text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT majetek_id_org_unique UNIQUE (id, organization_id)
);

CREATE TABLE kategorie (
  id               uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid          NOT NULL REFERENCES organization(id),
  typ              kategorie_typ NOT NULL,
  nazev            text          NOT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT kategorie_id_org_unique UNIQUE (id, organization_id)
);

-- 4. ucetni_obdobi — accounting period (§3/2, §17).
CREATE TABLE ucetni_obdobi (
  id               uuid               PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid               NOT NULL,
  jednotka_id      uuid               NOT NULL,
  typ              ucetni_obdobi_typ  NOT NULL,
  od               date               NOT NULL,
  "do"             date               NOT NULL,
  stav             ucetni_obdobi_stav NOT NULL DEFAULT 'otevreno',
  created_at       timestamptz        NOT NULL DEFAULT now(),
  updated_at       timestamptz        NOT NULL DEFAULT now(),
  CONSTRAINT ucetni_obdobi_dates_chk CHECK (od <= "do"),
  CONSTRAINT ucetni_obdobi_jednotka_fk
    FOREIGN KEY (jednotka_id, organization_id)
    REFERENCES ucetni_jednotka (id, organization_id),
  CONSTRAINT ucetni_obdobi_id_org_unique UNIQUE (id, organization_id)
);
CREATE INDEX ucetni_obdobi_jednotka_idx ON ucetni_obdobi (jednotka_id);
CREATE INDEX ucetni_obdobi_org_idx ON ucetni_obdobi (organization_id);

-- 5. ucetni_pripad — the economic fact (§6/1). NOT a record.
CREATE TABLE ucetni_pripad (
  id                 uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id    uuid        NOT NULL,
  jednotka_id        uuid        NOT NULL,
  protistrana_id     uuid,
  popis              text        NOT NULL,
  datum_uskutecneni  date        NOT NULL,
  typ                text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ucetni_pripad_jednotka_fk
    FOREIGN KEY (jednotka_id, organization_id)
    REFERENCES ucetni_jednotka (id, organization_id),
  CONSTRAINT ucetni_pripad_protistrana_fk
    FOREIGN KEY (protistrana_id, organization_id)
    REFERENCES protistrana (id, organization_id),
  CONSTRAINT ucetni_pripad_id_org_unique UNIQUE (id, organization_id)
);
CREATE INDEX ucetni_pripad_jednotka_idx ON ucetni_pripad (jednotka_id);
CREATE INDEX ucetni_pripad_org_idx ON ucetni_pripad (organization_id);
CREATE INDEX ucetni_pripad_protistrana_idx ON ucetni_pripad (protistrana_id);

-- 6. ucetni_doklad — source document / voucher (§11). oznaceni is the číselná
--    řada: unique per (jednotka via organization_id) + period + type (§11/1a).
CREATE TABLE ucetni_doklad (
  id                  uuid              PRIMARY KEY DEFAULT uuidv7(),
  organization_id     uuid              NOT NULL,
  jednotka_id         uuid              NOT NULL,
  obdobi_id           uuid              NOT NULL,
  protistrana_id      uuid,
  typ                 ucetni_doklad_typ NOT NULL,
  oznaceni            text              NOT NULL,
  okamzik_vyhotoveni  timestamptz       NOT NULL,
  created_at          timestamptz       NOT NULL DEFAULT now(),
  updated_at          timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT ucetni_doklad_jednotka_fk
    FOREIGN KEY (jednotka_id, organization_id)
    REFERENCES ucetni_jednotka (id, organization_id),
  CONSTRAINT ucetni_doklad_obdobi_fk
    FOREIGN KEY (obdobi_id, organization_id)
    REFERENCES ucetni_obdobi (id, organization_id),
  CONSTRAINT ucetni_doklad_protistrana_fk
    FOREIGN KEY (protistrana_id, organization_id)
    REFERENCES protistrana (id, organization_id),
  CONSTRAINT ucetni_doklad_cislo_rada_unique UNIQUE (organization_id, obdobi_id, typ, oznaceni),
  CONSTRAINT ucetni_doklad_id_org_unique UNIQUE (id, organization_id)
);
CREATE INDEX ucetni_doklad_jednotka_idx ON ucetni_doklad (jednotka_id);
CREATE INDEX ucetni_doklad_obdobi_idx ON ucetni_doklad (obdobi_id);
CREATE INDEX ucetni_doklad_org_idx ON ucetni_doklad (organization_id);
CREATE INDEX ucetni_doklad_protistrana_idx ON ucetni_doklad (protistrana_id);

-- 7. doklad_radek — jednotlivý záznam, one line of a doklad (§4/11). Documents
--    one case (§6/1).
CREATE TABLE doklad_radek (
  id               uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid          NOT NULL,
  doklad_id        uuid          NOT NULL,
  pripad_id        uuid          NOT NULL,
  popis            text,
  castka           numeric(19,4) NOT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT doklad_radek_doklad_fk
    FOREIGN KEY (doklad_id, organization_id)
    REFERENCES ucetni_doklad (id, organization_id),
  CONSTRAINT doklad_radek_pripad_fk
    FOREIGN KEY (pripad_id, organization_id)
    REFERENCES ucetni_pripad (id, organization_id),
  CONSTRAINT doklad_radek_id_org_unique UNIQUE (id, organization_id)
);
CREATE INDEX doklad_radek_doklad_idx ON doklad_radek (doklad_id);
CREATE INDEX doklad_radek_pripad_idx ON doklad_radek (pripad_id);
CREATE INDEX doklad_radek_org_idx ON doklad_radek (organization_id);

-- 8. dilci_zaznam — money decomposition, PRE-posting (§33/5): base / VAT / rounding.
CREATE TABLE dilci_zaznam (
  id               uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid          NOT NULL,
  doklad_radek_id  uuid          NOT NULL,
  druh             dilci_druh    NOT NULL,
  castka           numeric(19,4) NOT NULL,
  dph_sazba        numeric(5,2),
  dph_castka       numeric(19,4),
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT dilci_zaznam_doklad_radek_fk
    FOREIGN KEY (doklad_radek_id, organization_id)
    REFERENCES doklad_radek (id, organization_id),
  CONSTRAINT dilci_zaznam_id_org_unique UNIQUE (id, organization_id)
);
CREATE INDEX dilci_zaznam_doklad_radek_idx ON dilci_zaznam (doklad_radek_id);
CREATE INDEX dilci_zaznam_org_idx ON dilci_zaznam (organization_id);

COMMIT;
