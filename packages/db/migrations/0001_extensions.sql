-- Migration 0001: PostgreSQL extensions required for the monorepo schema.
--
-- Loads five extensions:
--   uuid-ossp   legacy uuid helpers (kept for compatibility)
--   ltree       hierarchical codes on account.code (CoA)
--   pg_trgm     GIN indexes for full-text fuzzy search
--   btree_gist  EXCLUDE USING gist on date-range overlap constraints
--   vector      pgvector for AI embeddings (graceful skip when absent)
--
-- Requires PostgreSQL 18+ (uuidv7() is native from PG18; all CREATE TABLE
-- statements in subsequent migrations default to uuidv7()).

BEGIN;

DO $$
BEGIN
  IF current_setting('server_version_num')::int < 180000 THEN
    RAISE EXCEPTION 'PostgreSQL 18+ required (uuidv7 native; server_version_num=% is below 180000)',
      current_setting('server_version_num');
  END IF;
END
$$;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS ltree;
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- pgvector: wrapped in DO/EXCEPTION so environments without the extension
-- (e.g. testcontainers with plain postgres:18-alpine) do not abort the
-- migration chain. On dev Docker and prod RDS the extension is available.
DO $$
BEGIN
  CREATE EXTENSION IF NOT EXISTS vector;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pgvector not available in this environment (SQLSTATE %): skipping', SQLSTATE;
END;
$$;

COMMIT;
