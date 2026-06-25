-- Migration 0025: Accounting Records System — posting layer.
--
-- Shared posting header (ucetni_zapis), the two regime-specific posting-line
-- shapes (zapis_radek for PODVOJNE §13; penezni_denik_radek for JEDNODUCHE
-- §13b / DANOVA_EVIDENCE §7b), the chart of accounts (uctovy_rozvrh + ucet),
-- period output marker (vystup), and supporting records (odpisovy_plan,
-- inventurni_soupis, podpis). See 0024 header for the composite-FK tenancy rule.
--
-- R7 (regime branch) is enforced DECLARATIVELY: ucetni_zapis carries a UNIQUE
-- (id, organization_id, regime); each posting line denormalizes `regime` and
-- composite-FKs into it, so a line's regime always equals its parent's, and a
-- CHECK pins each line table to its regime set. ucetni_zapis.regime immutability
-- (required for soundness) is guaranteed by the append-only triggers in 0027.

BEGIN;

-- 1. uctovy_rozvrh — chart of accounts (§14, §13/3).
CREATE TABLE uctovy_rozvrh (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL,
  jednotka_id      uuid        NOT NULL,
  rok              smallint    NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uctovy_rozvrh_jednotka_fk
    FOREIGN KEY (jednotka_id, organization_id)
    REFERENCES ucetni_jednotka (id, organization_id),
  CONSTRAINT uctovy_rozvrh_org_rok_unique UNIQUE (organization_id, rok),
  CONSTRAINT uctovy_rozvrh_id_org_unique UNIQUE (id, organization_id)
);
CREATE INDEX uctovy_rozvrh_jednotka_idx ON uctovy_rozvrh (jednotka_id);

-- 2. ucet — account. Analytical→synthetic via parent_id, constrained to the
--    same chart (§16). No jednotka_id (per ERD); organization_id flows from the
--    chart via the composite FK.
CREATE TABLE ucet (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL,
  rozvrh_id        uuid        NOT NULL,
  parent_id        uuid,
  cislo            text        NOT NULL,
  trida            smallint    NOT NULL,
  typ              ucet_typ    NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ucet_no_self_parent CHECK (parent_id IS NULL OR parent_id <> id),
  CONSTRAINT ucet_rozvrh_fk
    FOREIGN KEY (rozvrh_id, organization_id)
    REFERENCES uctovy_rozvrh (id, organization_id),
  CONSTRAINT ucet_parent_same_chart_fk
    FOREIGN KEY (parent_id, rozvrh_id)
    REFERENCES ucet (id, rozvrh_id),
  CONSTRAINT ucet_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT ucet_id_rozvrh_unique UNIQUE (id, rozvrh_id),
  CONSTRAINT ucet_rozvrh_cislo_unique UNIQUE (rozvrh_id, cislo)
);
CREATE INDEX ucet_rozvrh_idx ON ucet (rozvrh_id);
CREATE INDEX ucet_parent_idx ON ucet (parent_id);
CREATE INDEX ucet_org_idx ON ucet (organization_id);

-- 3. odpisovy_plan — depreciation plan (§4/11). Generates monthly postings.
CREATE TABLE odpisovy_plan (
  id               uuid          PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid          NOT NULL,
  jednotka_id      uuid          NOT NULL,
  majetek_id       uuid          NOT NULL,
  metoda           text          NOT NULL,
  mesicni_castka   numeric(19,4) NOT NULL,
  created_at       timestamptz   NOT NULL DEFAULT now(),
  updated_at       timestamptz   NOT NULL DEFAULT now(),
  CONSTRAINT odpisovy_plan_jednotka_fk
    FOREIGN KEY (jednotka_id, organization_id)
    REFERENCES ucetni_jednotka (id, organization_id),
  CONSTRAINT odpisovy_plan_majetek_fk
    FOREIGN KEY (majetek_id, organization_id)
    REFERENCES majetek (id, organization_id),
  CONSTRAINT odpisovy_plan_id_org_unique UNIQUE (id, organization_id)
);
CREATE INDEX odpisovy_plan_jednotka_idx ON odpisovy_plan (jednotka_id);
CREATE INDEX odpisovy_plan_majetek_idx ON odpisovy_plan (majetek_id);

-- 4. inventurni_soupis — inventory list (§30). Differences generate postings.
CREATE TABLE inventurni_soupis (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL,
  jednotka_id      uuid        NOT NULL,
  datum            date        NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT inventurni_soupis_jednotka_fk
    FOREIGN KEY (jednotka_id, organization_id)
    REFERENCES ucetni_jednotka (id, organization_id),
  CONSTRAINT inventurni_soupis_id_org_unique UNIQUE (id, organization_id)
);
CREATE INDEX inventurni_soupis_jednotka_idx ON inventurni_soupis (jednotka_id);

-- 5. ucetni_zapis — the posting (§12), on the basis of a doklad (§6/2). Shared
--    header for all regimes (for DANOVA_EVIDENCE it is a technical container,
--    NOT a legal účetní zápis — see spec §5.2). Corrections reference the
--    original via opravuje_zapis_id (ČÚS 001, §35).
CREATE TABLE ucetni_zapis (
  id                  uuid                    PRIMARY KEY DEFAULT uuidv7(),
  organization_id     uuid                    NOT NULL,
  jednotka_id         uuid                    NOT NULL,
  obdobi_id           uuid                    NOT NULL,
  doklad_id           uuid                    NOT NULL,
  pripad_id           uuid                    NOT NULL,
  odpisovy_plan_id    uuid,
  inventura_id        uuid,
  opravuje_zapis_id   uuid,
  oprava_typ          ucetni_zapis_oprava_typ,
  datum               date                    NOT NULL,
  regime              accounting_regime       NOT NULL,
  druh                ucetni_zapis_druh       NOT NULL,
  odpovedna_osoba     uuid                    NOT NULL REFERENCES app_user(id),
  okamzik_zauctovani  timestamptz             NOT NULL,
  -- No updated_at: ucetni_zapis is append-only (R8); a row never changes after
  -- insert. Corrections are new rows (opravuje_zapis_id), not updates.
  created_at          timestamptz             NOT NULL DEFAULT now(),
  CONSTRAINT ucetni_zapis_oprava_consistency
    CHECK ((opravuje_zapis_id IS NULL) = (oprava_typ IS NULL)),
  -- 3-col FK: a posting's regime must equal its accounting unit's regime,
  -- so R7 routing (zapis_radek vs penezni_denik_radek) can never diverge from
  -- the unit's declared regime.
  CONSTRAINT ucetni_zapis_jednotka_fk
    FOREIGN KEY (jednotka_id, organization_id, regime)
    REFERENCES ucetni_jednotka (id, organization_id, regime),
  CONSTRAINT ucetni_zapis_obdobi_fk
    FOREIGN KEY (obdobi_id, organization_id)
    REFERENCES ucetni_obdobi (id, organization_id),
  CONSTRAINT ucetni_zapis_doklad_fk
    FOREIGN KEY (doklad_id, organization_id)
    REFERENCES ucetni_doklad (id, organization_id),
  CONSTRAINT ucetni_zapis_pripad_fk
    FOREIGN KEY (pripad_id, organization_id)
    REFERENCES ucetni_pripad (id, organization_id),
  CONSTRAINT ucetni_zapis_odpisovy_plan_fk
    FOREIGN KEY (odpisovy_plan_id, organization_id)
    REFERENCES odpisovy_plan (id, organization_id),
  CONSTRAINT ucetni_zapis_inventura_fk
    FOREIGN KEY (inventura_id, organization_id)
    REFERENCES inventurni_soupis (id, organization_id),
  CONSTRAINT ucetni_zapis_opravuje_fk
    FOREIGN KEY (opravuje_zapis_id, organization_id)
    REFERENCES ucetni_zapis (id, organization_id),
  CONSTRAINT ucetni_zapis_id_org_unique UNIQUE (id, organization_id),
  CONSTRAINT ucetni_zapis_id_org_regime_unique UNIQUE (id, organization_id, regime)
);
CREATE INDEX ucetni_zapis_jednotka_idx ON ucetni_zapis (jednotka_id);
CREATE INDEX ucetni_zapis_obdobi_idx ON ucetni_zapis (obdobi_id);
CREATE INDEX ucetni_zapis_doklad_idx ON ucetni_zapis (doklad_id);
CREATE INDEX ucetni_zapis_pripad_idx ON ucetni_zapis (pripad_id);
CREATE INDEX ucetni_zapis_opravuje_idx ON ucetni_zapis (opravuje_zapis_id);
CREATE INDEX ucetni_zapis_org_idx ON ucetni_zapis (organization_id);

-- 6. zapis_radek — one Má dáti/Dal side (§13/2). PODVOJNE only (R7). The posted
--    form of a dilci_zaznam (dilci_id, "Zaúčtování" §6/2) — nullable because
--    generated postings (opening balances 701, depreciation, storno) have no
--    source dílčí. castka may be negative (storno on original sides, ČÚS 001).
CREATE TABLE zapis_radek (
  id               uuid              PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid              NOT NULL,
  zapis_id         uuid              NOT NULL,
  regime           accounting_regime NOT NULL,
  ucet_id          uuid              NOT NULL,
  dilci_id         uuid,
  strana           zapis_strana      NOT NULL,
  castka           numeric(19,4)     NOT NULL,
  created_at       timestamptz       NOT NULL DEFAULT now(),
  CONSTRAINT zapis_radek_regime_chk CHECK (regime = 'PODVOJNE'),
  CONSTRAINT zapis_radek_zapis_fk
    FOREIGN KEY (zapis_id, organization_id, regime)
    REFERENCES ucetni_zapis (id, organization_id, regime),
  CONSTRAINT zapis_radek_ucet_fk
    FOREIGN KEY (ucet_id, organization_id)
    REFERENCES ucet (id, organization_id),
  CONSTRAINT zapis_radek_dilci_fk
    FOREIGN KEY (dilci_id, organization_id)
    REFERENCES dilci_zaznam (id, organization_id)
);
CREATE INDEX zapis_radek_zapis_idx ON zapis_radek (zapis_id);
CREATE INDEX zapis_radek_ucet_idx ON zapis_radek (ucet_id);
CREATE INDEX zapis_radek_dilci_idx ON zapis_radek (dilci_id);
CREATE INDEX zapis_radek_org_idx ON zapis_radek (organization_id);

-- 7. penezni_denik_radek — one classified peněžní-deník row (§13b / §7b).
--    JEDNODUCHE / DANOVA_EVIDENCE only (R7). Columns map to the standard cash
--    book form (§9).
CREATE TABLE penezni_denik_radek (
  id               uuid                PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid                NOT NULL,
  zapis_id         uuid                NOT NULL,
  regime           accounting_regime   NOT NULL,
  dilci_id         uuid,
  kategorie_id     uuid,
  misto            penezni_denik_misto NOT NULL,
  smer             penezni_denik_smer  NOT NULL,
  danovy           boolean             NOT NULL,
  prubezny         boolean             NOT NULL DEFAULT false,
  zaklad_dane      numeric(19,4),
  castka           numeric(19,4)       NOT NULL,
  created_at       timestamptz         NOT NULL DEFAULT now(),
  CONSTRAINT penezni_denik_radek_regime_chk CHECK (regime IN ('JEDNODUCHE', 'DANOVA_EVIDENCE')),
  CONSTRAINT penezni_denik_radek_zapis_fk
    FOREIGN KEY (zapis_id, organization_id, regime)
    REFERENCES ucetni_zapis (id, organization_id, regime),
  CONSTRAINT penezni_denik_radek_dilci_fk
    FOREIGN KEY (dilci_id, organization_id)
    REFERENCES dilci_zaznam (id, organization_id),
  CONSTRAINT penezni_denik_radek_kategorie_fk
    FOREIGN KEY (kategorie_id, organization_id)
    REFERENCES kategorie (id, organization_id)
);
CREATE INDEX penezni_denik_radek_zapis_idx ON penezni_denik_radek (zapis_id);
CREATE INDEX penezni_denik_radek_dilci_idx ON penezni_denik_radek (dilci_id);
CREATE INDEX penezni_denik_radek_kategorie_idx ON penezni_denik_radek (kategorie_id);
CREATE INDEX penezni_denik_radek_org_idx ON penezni_denik_radek (organization_id);

-- 8. vystup — period output marker (§18 / §13b/3 / §7b). Figures are DERIVED
--    from ledger / peněžní-deník balances (R9); never hand-entered. One marker
--    per period+type.
CREATE TABLE vystup (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL,
  jednotka_id      uuid        NOT NULL,
  obdobi_id        uuid        NOT NULL,
  typ              vystup_typ  NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT vystup_jednotka_fk
    FOREIGN KEY (jednotka_id, organization_id)
    REFERENCES ucetni_jednotka (id, organization_id),
  CONSTRAINT vystup_obdobi_fk
    FOREIGN KEY (obdobi_id, organization_id)
    REFERENCES ucetni_obdobi (id, organization_id),
  CONSTRAINT vystup_period_type_unique UNIQUE (organization_id, obdobi_id, typ)
);
CREATE INDEX vystup_jednotka_idx ON vystup (jednotka_id);
CREATE INDEX vystup_obdobi_idx ON vystup (obdobi_id);

-- 9. podpis — podpisový záznam (§33a/4). Links to exactly one of doklad/zapis.
CREATE TABLE podpis (
  id               uuid        PRIMARY KEY DEFAULT uuidv7(),
  organization_id  uuid        NOT NULL,
  doklad_id        uuid,
  zapis_id         uuid,
  typ              podpis_typ  NOT NULL,
  podepsal         uuid        NOT NULL REFERENCES app_user(id),
  okamzik          timestamptz NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT podpis_exactly_one_target CHECK ((doklad_id IS NOT NULL) <> (zapis_id IS NOT NULL)),
  CONSTRAINT podpis_doklad_fk
    FOREIGN KEY (doklad_id, organization_id)
    REFERENCES ucetni_doklad (id, organization_id),
  CONSTRAINT podpis_zapis_fk
    FOREIGN KEY (zapis_id, organization_id)
    REFERENCES ucetni_zapis (id, organization_id)
);
CREATE INDEX podpis_doklad_idx ON podpis (doklad_id);
CREATE INDEX podpis_zapis_idx ON podpis (zapis_id);
CREATE INDEX podpis_org_idx ON podpis (organization_id);

COMMIT;
