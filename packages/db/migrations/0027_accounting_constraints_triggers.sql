-- Migration 0027: Accounting Records System — invariant triggers (R4, R8, R12).
--
-- R4  double-entry balances: a PODVOJNE ucetni_zapis must have >=1 zapis_radek
--     and Σ(MD) = Σ(Dal). Enforced by a DEFERRABLE INITIALLY DEFERRED constraint
--     trigger so multi-line inserts are legal mid-transaction and the check runs
--     at COMMIT. Fires from BOTH ucetni_zapis (catches an empty zapis) and
--     zapis_radek (catches lines added to an existing zapis). Pure numeric(19,4)
--     arithmetic — never float. Cash-book regimes have no zapis_radek and skip.
-- R8  corrections, not edits: ucetni_zapis / zapis_radek / penezni_denik_radek
--     are append-only. BEFORE UPDATE/DELETE row triggers + BEFORE TRUNCATE
--     statement triggers block destructive change; a correction is a NEW
--     ucetni_zapis (opravuje_zapis_id, ČÚS 001 §35). This also makes
--     ucetni_zapis.regime immutable, which R7's composite-FK trick relies on.
-- R12 closed period rejects new postings: BEFORE INSERT on ucetni_zapis and
--     ucetni_doklad raises if the target ucetni_obdobi is 'uzavreno' (§17).

BEGIN;

-- R4 -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_assert_zapis_balanced(p_zapis_id uuid)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  v_regime accounting_regime;
  v_count  integer;
  v_md     numeric(19,4);
  v_d      numeric(19,4);
BEGIN
  SELECT regime INTO v_regime FROM ucetni_zapis WHERE id = p_zapis_id;
  IF NOT FOUND THEN
    -- zapis no longer exists (delete is blocked by R8 anyway); nothing to check.
    RETURN;
  END IF;
  IF v_regime <> 'PODVOJNE' THEN
    RETURN;
  END IF;

  SELECT count(*),
         COALESCE(SUM(castka) FILTER (WHERE strana = 'MD'), 0),
         COALESCE(SUM(castka) FILTER (WHERE strana = 'D'),  0)
    INTO v_count, v_md, v_d
    FROM zapis_radek
   WHERE zapis_id = p_zapis_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION 'ucetni_zapis % (PODVOJNE) has no zapis_radek lines (R3/R4 §13/2)', p_zapis_id
      USING ERRCODE = 'check_violation';
  END IF;
  IF v_md <> v_d THEN
    RAISE EXCEPTION 'ucetni_zapis % is unbalanced: Σ(MD)=% Σ(Dal)=% (R4 §13/2)', p_zapis_id, v_md, v_d
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
ALTER FUNCTION app_assert_zapis_balanced(uuid) OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_zapis_balance_from_zapis()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_zapis_balanced(NEW.id);
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_zapis_balance_from_zapis() OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_zapis_balance_from_radek()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM app_assert_zapis_balanced(NEW.zapis_id);
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_zapis_balance_from_radek() OWNER TO app_owner;

CREATE CONSTRAINT TRIGGER ucetni_zapis_balanced
  AFTER INSERT ON ucetni_zapis
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_zapis_balance_from_zapis();

CREATE CONSTRAINT TRIGGER zapis_radek_balanced
  AFTER INSERT ON zapis_radek
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION app_zapis_balance_from_radek();

-- R8 -------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_block_mutation_posting()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION
    '% is append-only (R8 §35): % blocked. Post a storno / doplňkový correction (a new ucetni_zapis with opravuje_zapis_id).',
    TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'check_violation';
END;
$$;
ALTER FUNCTION app_block_mutation_posting() OWNER TO app_owner;

CREATE OR REPLACE FUNCTION app_block_truncate_posting()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION '% is append-only (R8 §35); TRUNCATE is blocked.', TG_TABLE_NAME
    USING ERRCODE = 'feature_not_supported';
END;
$$;
ALTER FUNCTION app_block_truncate_posting() OWNER TO app_owner;

DO $$
DECLARE
  tbl text;
  posting_tables text[] := ARRAY['ucetni_zapis', 'zapis_radek', 'penezni_denik_radek'];
BEGIN
  FOREACH tbl IN ARRAY posting_tables LOOP
    EXECUTE format(
      'CREATE TRIGGER %I_block_update BEFORE UPDATE ON %I FOR EACH ROW EXECUTE FUNCTION app_block_mutation_posting()',
      tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I_block_delete BEFORE DELETE ON %I FOR EACH ROW EXECUTE FUNCTION app_block_mutation_posting()',
      tbl, tbl);
    EXECUTE format(
      'CREATE TRIGGER %I_block_truncate BEFORE TRUNCATE ON %I FOR EACH STATEMENT EXECUTE FUNCTION app_block_truncate_posting()',
      tbl, tbl);
  END LOOP;
END
$$;

-- R12 ------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_block_closed_period()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
  v_stav ucetni_obdobi_stav;
BEGIN
  SELECT stav INTO v_stav FROM ucetni_obdobi WHERE id = NEW.obdobi_id;
  IF v_stav = 'uzavreno' THEN
    RAISE EXCEPTION
      'ucetni_obdobi % is closed (uzavreno): no new % allowed (R12 §17). Post into an open period.',
      NEW.obdobi_id, TG_TABLE_NAME
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;
ALTER FUNCTION app_block_closed_period() OWNER TO app_owner;

CREATE TRIGGER ucetni_zapis_reject_closed_period
  BEFORE INSERT ON ucetni_zapis
  FOR EACH ROW EXECUTE FUNCTION app_block_closed_period();

CREATE TRIGGER ucetni_doklad_reject_closed_period
  BEFORE INSERT ON ucetni_doklad
  FOR EACH ROW EXECUTE FUNCTION app_block_closed_period();

COMMIT;
