-- 0071_posting_is_closing.sql
--
-- `posting.is_closing` — the tag for the 702 balance-close posting (účet 702 Konečný
-- účet rozvažný), the mirror of the existing `is_opening` tag on the 701 opening
-- posting. At year-end close the result-close (5xx/6xx → 710 → 431) runs as real
-- turnover (unchanged), then EVERY balance-sheet account is closed to 702 so the KÚR
-- balance equation (assets = liabilities + equity) is proven: the 702 posting nets to
-- zero. That 702 posting is a deník/audit artifact + verification check — it must NOT
-- mutate the read-model, or every balance-sheet `closing_balance` would collapse to 0
-- and destroy both the carryover source (`openNextPeriod` reads `closing_balance`) and
-- `buildZaverka`'s rozvaha. So `is_closing` lines feed NEITHER opening_balance NOR
-- turnover (exactly like `is_opening` feeds only opening_balance), and the reconcile
-- detector excludes them so it does not report false drift.
--
-- Additive: the column defaults false, so every existing posting stays a normal
-- (non-closing) posting and the three replaced functions behave identically for all
-- current data — the new branch only fires for a future 702 posting. Handwritten SQL
-- (ADR-0009; drizzle-kit forbidden). One whole-file transaction.
BEGIN;

-- 1. The column. NOT NULL DEFAULT false — a posting is a 702 balance-close only when
--    the close path (closePeriod, a later change) sets it; every other posting is false.
ALTER TABLE posting
  ADD COLUMN IF NOT EXISTS is_closing boolean NOT NULL DEFAULT false;

-- A posting is a 701 opening OR a 702 close OR neither, never both. The read-model
-- maintain branch resolves is_closing first, so a posting flagged both would silently
-- drop a 701's opening_balance (breaking carryover) — forbid the state outright.
-- DO-guarded so re-running the migration is idempotent (ADD CONSTRAINT has no IF NOT EXISTS).
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'posting_open_close_excl') THEN
    ALTER TABLE posting
      ADD CONSTRAINT posting_open_close_excl CHECK (NOT (is_opening AND is_closing));
  END IF;
END $$;

-- 2. Read-model maintenance — an is_closing (702) line feeds NEITHER opening_balance
--    NOR turnover (the read-model-neutral branch, mirror of the is_opening branch), so
--    `closing_balance` keeps the true konečný stav (the rozvaha value, before the
--    technical zeroing that 702 represents in the deník). Replaces the 0035 definition;
--    the is_opening / turnover branches are unchanged.
CREATE OR REPLACE FUNCTION app_maintain_account_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_is_opening boolean;
  v_is_closing boolean;
  v_debit  numeric(19,4) := CASE WHEN NEW.side = 'DEBIT'  THEN NEW.amount ELSE 0 END;
  v_credit numeric(19,4) := CASE WHEN NEW.side = 'CREDIT' THEN NEW.amount ELSE 0 END;
BEGIN
  SELECT is_opening, is_closing INTO v_is_opening, v_is_closing FROM posting WHERE id = NEW.posting_id;

  IF v_is_closing THEN
    -- 702 balance-close: a deník/audit artifact + KÚR check, NOT the balance source.
    -- Touch nothing — closing_balance stays the konečný stav that carryover (701 next
    -- year) and buildZaverka's rozvaha read.
    RETURN NULL;
  END IF;

  IF v_is_opening THEN
    -- opening posting (701): sets opening_balance (debit-positive), not turnover; stays in deník
    INSERT INTO account_period_balance (organization_id, period_id, account_id, opening_balance)
    VALUES (NEW.organization_id, NEW.period_id, NEW.account_id, v_debit - v_credit)
    ON CONFLICT (organization_id, period_id, account_id) DO UPDATE
      SET opening_balance = account_period_balance.opening_balance + EXCLUDED.opening_balance,
          updated_at = now();
  ELSE
    INSERT INTO account_period_balance (organization_id, period_id, account_id, turnover_debit, turnover_credit)
    VALUES (NEW.organization_id, NEW.period_id, NEW.account_id, v_debit, v_credit)
    ON CONFLICT (organization_id, period_id, account_id) DO UPDATE
      SET turnover_debit  = account_period_balance.turnover_debit  + EXCLUDED.turnover_debit,
          turnover_credit = account_period_balance.turnover_credit + EXCLUDED.turnover_credit,
          updated_at = now();
  END IF;
  RETURN NULL;
END;
$$;
ALTER FUNCTION app_maintain_account_balance() OWNER TO app_owner;

-- 3. Materialization drift reconcile — closing_balance = opening + turnover, and 702
--    (is_closing) lines entered NEITHER, so they are NOT part of closing_balance. The
--    journal Σ must therefore EXCLUDE is_closing lines (else the excluded 702 lines make
--    Σ ≠ closing_balance and every closed account reports as false drift). is_opening
--    lines are still summed (they ARE in opening_balance ⊂ closing_balance). Replaces the
--    0035 definition; the join to `posting` is what carries the is_closing flag to the line.
CREATE OR REPLACE FUNCTION app_reconcile_account_period(p_period_id uuid)
RETURNS TABLE (account_id uuid, read_model_closing numeric, journal_sum numeric)
LANGUAGE sql STABLE AS $$
  SELECT b.account_id, b.closing_balance,
         COALESCE((SELECT SUM(CASE WHEN l.side = 'DEBIT' THEN l.amount ELSE -l.amount END)
                     FROM posting_double_entry_line l
                     JOIN posting p ON p.id = l.posting_id
                    WHERE l.account_id = b.account_id AND l.period_id = b.period_id
                      AND NOT p.is_closing), 0)
    FROM account_period_balance b
   WHERE b.period_id = p_period_id
     AND b.closing_balance <> COALESCE((SELECT SUM(CASE WHEN l.side = 'DEBIT' THEN l.amount ELSE -l.amount END)
                     FROM posting_double_entry_line l
                     JOIN posting p ON p.id = l.posting_id
                    WHERE l.account_id = b.account_id AND l.period_id = b.period_id
                      AND NOT p.is_closing), 0);
$$;
ALTER FUNCTION app_reconcile_account_period(uuid) OWNER TO app_owner;

-- 4. Posting balance guard — a 702 balance-close, like a 701 opening, is balance-sheet
--    ONLY: it closes ASSET/LIABILITY/EQUITY accounts to the CLOSING-nature 702 account and
--    never touches a P&L (5xx/6xx) account (those were already zeroed to 710 by the result
--    close). Reject an is_closing posting that touches a P&L account (symmetric with the
--    is_opening guard). The two-sided Σ(MD)=Σ(Dal) check is unchanged and still applies —
--    702's own lines net to zero, so it passes. Replaces the 0035 definition.
CREATE OR REPLACE FUNCTION app_assert_posting_balanced(p_posting_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public, pg_catalog AS $$
DECLARE
  v_regime     text;
  v_is_opening boolean;
  v_is_closing boolean;
  v_total      integer;
  v_onbal      integer;
  v_debit_n    integer;
  v_credit_n   integer;
  v_pl_n       integer;
  v_md         numeric(19,4);
  v_d          numeric(19,4);
BEGIN
  SELECT regime_code, is_opening, is_closing INTO v_regime, v_is_opening, v_is_closing FROM posting WHERE id = p_posting_id;
  IF NOT FOUND THEN RETURN; END IF;                 -- posting gone (delete is blocked anyway)
  IF v_regime <> 'DOUBLE_ENTRY' THEN RETURN; END IF;

  SELECT count(*) INTO v_total
    FROM posting_double_entry_line WHERE posting_id = p_posting_id;
  IF v_total = 0 THEN
    RAISE EXCEPTION 'posting % (DOUBLE_ENTRY) has no lines (R3/R4 §13/2)', p_posting_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- on-balance lines only: OFF_BALANCE (podrozvaha) lines post single-sided (M1)
  SELECT count(*),
         count(*) FILTER (WHERE l.side = 'DEBIT'),
         count(*) FILTER (WHERE l.side = 'CREDIT'),
         count(*) FILTER (WHERE a.nature IN ('EXPENSE','REVENUE')),
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'DEBIT'),  0),
         COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'CREDIT'), 0)
    INTO v_onbal, v_debit_n, v_credit_n, v_pl_n, v_md, v_d
    FROM posting_double_entry_line l
    JOIN account a ON a.id = l.account_id
   WHERE l.posting_id = p_posting_id
     AND a.nature <> 'OFF_BALANCE';

  IF v_onbal > 0 THEN
    IF v_onbal < 2 THEN
      RAISE EXCEPTION 'posting % has single-sided on-balance lines (need >=2 for a double entry; R4 §13/2)', p_posting_id
        USING ERRCODE = 'check_violation';
    END IF;
    -- §13/2: a posting books on the Má dáti side of one account AND the Dal side of another
    -- (closes the same-side-netting-to-zero degenerate: 211 +1000 / 211 -1000).
    IF v_debit_n = 0 OR v_credit_n = 0 THEN
      RAISE EXCEPTION 'posting % must touch both a Má dáti and a Dal side (§13/2)', p_posting_id
        USING ERRCODE = 'check_violation';
    END IF;
    IF v_md <> v_d THEN
      RAISE EXCEPTION 'posting % is unbalanced: Σ(MD)=% Σ(Dal)=% (R4 §13/2)', p_posting_id, v_md, v_d
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  -- an opening posting (701) sets počáteční stavy of balance-sheet accounts only; P&L
  -- accounts (5xx/6xx) start each period at zero and never carry an opening balance (ČÚS 002).
  IF v_is_opening AND v_pl_n > 0 THEN
    RAISE EXCEPTION 'opening posting % touches a P&L (5xx/6xx) account: opening balances are balance-sheet only (ČÚS 002)', p_posting_id
      USING ERRCODE = 'check_violation';
  END IF;

  -- a closing posting (702) closes balance-sheet accounts to 702; the P&L accounts were
  -- already zeroed to 710 by the result close, so a 702 line on a 5xx/6xx account is an error.
  IF v_is_closing AND v_pl_n > 0 THEN
    RAISE EXCEPTION 'closing posting % touches a P&L (5xx/6xx) account: the 702 balance-close is balance-sheet only', p_posting_id
      USING ERRCODE = 'check_violation';
  END IF;
END;
$$;
ALTER FUNCTION app_assert_posting_balanced(uuid) OWNER TO app_owner;

COMMIT;
