-- Migration 0028: Accounting Records System — books as views (§13, §13b).
--
-- The accounting books are NOT tables (spec §5.5): deník = postings by time,
-- hlavní kniha = by account, knihy analytických / podrozvahových účtů =
-- subsets, peněžní deník = the cash-book rows. They are SQL views over the
-- posting lines.
--
-- security_invoker = on (PG default is off): a default view runs base-table RLS
-- as the view OWNER (app_owner), bypassing organization_isolation and leaking
-- cross-org data. security_invoker makes RLS evaluate as the querying role
-- (app_user), so each base table's organization_isolation policy applies.
--
-- Each view filters by regime so PODVOJNE books never include cash-book rows
-- and vice versa (R7 at read time). app_user needs an explicit GRANT SELECT.

BEGIN;

-- 1. deník — postings in chronological order (PODVOJNE §13).
CREATE VIEW v_denik WITH (security_invoker = on) AS
SELECT
  zr.organization_id,
  z.id            AS zapis_id,
  z.datum,
  z.doklad_id,
  d.typ           AS doklad_typ,
  d.oznaceni      AS doklad_oznaceni,
  z.pripad_id,
  zr.id           AS zapis_radek_id,
  zr.ucet_id,
  u.cislo         AS ucet_cislo,
  zr.strana,
  zr.castka
FROM zapis_radek zr
JOIN ucetni_zapis z  ON zr.zapis_id = z.id
JOIN ucet u          ON zr.ucet_id  = u.id
JOIN ucetni_doklad d ON z.doklad_id = d.id
WHERE z.regime = 'PODVOJNE';

-- 2. hlavní kniha — balances grouped by account (PODVOJNE §13). zustatek is the
--    raw MD-minus-Dal turnover; the service interprets the sign by account typ.
CREATE VIEW v_hlavni_kniha WITH (security_invoker = on) AS
SELECT
  u.organization_id,
  u.id     AS ucet_id,
  u.cislo  AS ucet_cislo,
  u.typ    AS ucet_typ,
  u.parent_id,
  COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0) AS md_total,
  COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'),  0) AS d_total,
  COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0)
    - COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'), 0) AS zustatek
FROM ucet u
JOIN zapis_radek zr ON zr.ucet_id = u.id
JOIN ucetni_zapis z ON zr.zapis_id = z.id
WHERE z.regime = 'PODVOJNE'
GROUP BY u.id, u.organization_id, u.cislo, u.typ, u.parent_id;

-- 3. kniha analytických účtů — analytical accounts (parent_id IS NOT NULL, §16).
CREATE VIEW v_kniha_analytickych_uctu WITH (security_invoker = on) AS
SELECT
  u.organization_id,
  u.id        AS ucet_id,
  u.cislo     AS ucet_cislo,
  u.parent_id AS synteticky_ucet_id,
  COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0) AS md_total,
  COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'),  0) AS d_total,
  COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0)
    - COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'), 0) AS zustatek
FROM ucet u
JOIN zapis_radek zr ON zr.ucet_id = u.id
JOIN ucetni_zapis z ON zr.zapis_id = z.id
WHERE z.regime = 'PODVOJNE' AND u.parent_id IS NOT NULL
GROUP BY u.id, u.organization_id, u.cislo, u.parent_id;

-- 4. kniha podrozvahových účtů — off-balance accounts (typ='podrozvahovy', §13).
CREATE VIEW v_kniha_podrozvahovych_uctu WITH (security_invoker = on) AS
SELECT
  u.organization_id,
  u.id    AS ucet_id,
  u.cislo AS ucet_cislo,
  COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'MD'), 0) AS md_total,
  COALESCE(SUM(zr.castka) FILTER (WHERE zr.strana = 'D'),  0) AS d_total
FROM ucet u
JOIN zapis_radek zr ON zr.ucet_id = u.id
JOIN ucetni_zapis z ON zr.zapis_id = z.id
WHERE z.regime = 'PODVOJNE' AND u.typ = 'podrozvahovy'
GROUP BY u.id, u.organization_id, u.cislo;

-- 5. peněžní deník — classified cash-book rows (JEDNODUCHE §13b / DANOVA_EVIDENCE §7b).
CREATE VIEW v_penezni_denik WITH (security_invoker = on) AS
SELECT
  pdr.organization_id,
  z.id          AS zapis_id,
  z.datum,
  z.regime,
  z.doklad_id,
  pdr.id        AS radek_id,
  pdr.misto,
  pdr.smer,
  pdr.danovy,
  pdr.prubezny,
  pdr.kategorie_id,
  k.typ         AS kategorie_typ,
  k.nazev       AS kategorie_nazev,
  pdr.zaklad_dane,
  pdr.castka
FROM penezni_denik_radek pdr
JOIN ucetni_zapis z   ON pdr.zapis_id = z.id
LEFT JOIN kategorie k ON pdr.kategorie_id = k.id
WHERE z.regime IN ('JEDNODUCHE', 'DANOVA_EVIDENCE');

-- Grants ----------------------------------------------------------------------

DO $$
DECLARE
  v text;
  views text[] := ARRAY[
    'v_denik', 'v_hlavni_kniha', 'v_kniha_analytickych_uctu',
    'v_kniha_podrozvahovych_uctu', 'v_penezni_denik'
  ];
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    FOREACH v IN ARRAY views LOOP
      EXECUTE format('GRANT SELECT ON %I TO app_user', v);
    END LOOP;
  END IF;
END
$$;

COMMIT;
