-- 0044_auth_token_pending_invite_unique.sql
--
-- Close the invite duplicate-email race (#509) at the storage boundary.
--
-- Invites live in the unified auth_token table (ADR-0022): kind='inv',
-- status='pending', with the recipient email + organization id inside the
-- `payload` JSONB (there is no top-level email / organization_id column). The
-- issuer (packages/auth/src/invite-issuer.ts) had no pre-insert guard, so two
-- concurrent issue calls for the same (organization, email) could both insert a
-- pending row. A pre-insert SELECT alone cannot close that TOCTOU window — only
-- a DB uniqueness constraint can.
--
-- This adds a PARTIAL UNIQUE index scoped to pending invites only. Consumed /
-- revoked / expired rows are excluded, so an email can be re-invited once the
-- previous invite leaves the pending state (the normal revoke-then-reissue
-- flow). The org id + email are matched through the payload; email is folded to
-- lower() so a case variant cannot slip a second pending invite past the guard
-- (the issuer already normalises to lowercase on write).
--
-- Expression + partial index — a functional UNIQUE on
-- (payload->>'organizationId', lower(payload->>'email')). Rows whose payload
-- lacks either key (non-invite kinds are excluded by the WHERE; a malformed inv
-- payload would index NULL) do not collide, matching SQL NULL semantics.
--
-- Additive, idempotent, one whole-file transaction. Handwritten SQL (ADR-0009).
-- Non-CONCURRENTLY: the create runs inside the migration transaction; the table
-- is tiny (in-flight tokens only) and pre-launch has no meaningful pending set.
--
-- A dedup pre-step revokes any pre-existing duplicate pending invites so the
-- CREATE cannot abort the deploy (see below).
--
-- Number 0044 = next free after main's 0043_accounting_supply_kind (#520).

BEGIN;

-- Dedup pre-step: without the index, the same key could already hold >1 pending
-- invite (e.g. the same email submitted twice in one onboarding team batch,
-- where revoke-then-issue runs per row with no cross-row guard). Revoke all but
-- the newest pending invite per (organization, lower(email)) so the CREATE
-- UNIQUE INDEX below cannot fail on legacy data. Newest (max issued_at) survives
-- as the live invite; the rest move to 'revoked' — a normal terminal state the
-- app already produces via revokePendingInvites, so the auth_token append-only
-- trigger (which permits pending -> revoked) accepts it.
UPDATE auth_token
   SET status = 'revoked'
 WHERE id IN (
   SELECT id
     FROM (
       SELECT id,
              row_number() OVER (
                PARTITION BY payload ->> 'organizationId', lower(payload ->> 'email')
                ORDER BY issued_at DESC, id DESC
              ) AS rn
         FROM auth_token
        WHERE kind = 'inv' AND status = 'pending'
     ) ranked
    WHERE rn > 1
 );

CREATE UNIQUE INDEX IF NOT EXISTS auth_token_pending_invite_unique
  ON auth_token ((payload ->> 'organizationId'), lower(payload ->> 'email'))
  WHERE kind = 'inv' AND status = 'pending';

COMMENT ON INDEX auth_token_pending_invite_unique IS
  'Partial UNIQUE guard: at most one pending invite (kind=inv, status=pending) per (organization, lower(email)). Closes the concurrent double-invite race (#509).';

COMMIT;
