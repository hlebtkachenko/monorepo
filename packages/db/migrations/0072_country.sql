-- 0072_country.sql
--
-- country — ISO 3166-1 country reference register (Adresář ▸ Veřejné číselníky ▸ Státy).
--
-- Reference (system) table — shared across all tenants, NOT tenant-scoped, no RLS.
-- The pilot ships only OBJECTIVE columns (iso2 + ISO-4217 currency + active state). Country
-- display names are NOT stored here — they are generated into next-intl messages
-- (`countryNames`, keyed by iso2; see packages/i18n/scripts/gen-country-names.ts), matching
-- the reference-name i18n mechanism (docs/runbooks/I18N-REFERENCE-DATA-LOCALIZATION.md).
-- iso3 / numeric_code / EU+EEA membership / VAT-territory classification are a later
-- enrichment PR — the last three feed VAT reverse-charge logic and are a reviewed domain
-- call, not mechanical generation.
--
-- currency_code is a plain ISO-4217 code, deliberately NOT a foreign key: the `currency`
-- table is a 5-row functional-currency subset, while a country register spans every world
-- currency. No FK is added onto existing `country_code` columns either (additive migration).
--
-- Conventions (ADR-0009): handwritten SQL, snake_case, full words only. Rows seeded in 0073.

BEGIN;

CREATE TABLE country (
  iso2          char(2)  PRIMARY KEY,                        -- ISO 3166-1 alpha-2
  currency_code varchar(3),                                  -- ISO 4217; NULL where unknown
  active        boolean  NOT NULL DEFAULT true,
  CONSTRAINT country_iso2_format CHECK (iso2 ~ '^[A-Z]{2}$'),
  CONSTRAINT country_currency_format
    CHECK (currency_code IS NULL OR currency_code ~ '^[A-Z]{3}$')
);

COMMIT;
