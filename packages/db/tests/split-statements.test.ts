/**
 * Unit test for the outside-transaction SQL splitter (DB-08).
 *
 * The bug: the old splitter dropped any CHUNK starting with `--`, so a
 * statement written as `-- comment\nCREATE INDEX CONCURRENTLY …` (the house
 * style — every migration prefixes statements with comment blocks) was
 * silently skipped and the migration was still journaled as applied.
 *
 * Pure unit test — no database needed (the shared testcontainer from
 * global-setup is simply unused here).
 */
import { describe, expect, it } from "vitest"
import { splitSqlStatements } from "../scripts/split-statements"

describe("splitSqlStatements", () => {
  it("keeps a statement that is prefixed by a comment line (the DB-08 bug)", () => {
    const body = [
      "-- Speed up FK lookups on auth_token.",
      "CREATE INDEX CONCURRENTLY auth_token_user_idx ON auth_token (issued_to_user_id);",
      "",
      "-- Second statement, also comment-prefixed.",
      "CREATE INDEX CONCURRENTLY auth_token_ws_idx ON auth_token (workspace_id);",
      "",
    ].join("\n")

    expect(splitSqlStatements(body)).toEqual([
      "CREATE INDEX CONCURRENTLY auth_token_user_idx ON auth_token (issued_to_user_id)",
      "CREATE INDEX CONCURRENTLY auth_token_ws_idx ON auth_token (workspace_id)",
    ])
  })

  it("drops chunks that are comments only", () => {
    const body = [
      "-- A migration header comment block,",
      "-- spanning multiple lines.",
      "",
      "ALTER TYPE my_enum ADD VALUE 'new';",
      "-- trailing remark",
      "",
    ].join("\n")

    expect(splitSqlStatements(body)).toEqual([
      "ALTER TYPE my_enum ADD VALUE 'new'",
    ])
  })

  it("strips interleaved and indented comment lines inside a statement", () => {
    const body = [
      "CREATE INDEX CONCURRENTLY idx_a",
      "  -- composite: hot path for the worker drain",
      "  ON outbox (processed_at, created_at);",
      "",
    ].join("\n")

    expect(splitSqlStatements(body)).toEqual([
      "CREATE INDEX CONCURRENTLY idx_a\n  ON outbox (processed_at, created_at)",
    ])
  })

  it("returns an empty list for whitespace/comment-only input", () => {
    expect(splitSqlStatements("-- nothing here\n\n  \n")).toEqual([])
  })

  it("splits only on semicolon-at-end-of-line, not semicolons inside a line", () => {
    const body =
      "CREATE INDEX CONCURRENTLY idx_b ON t (col) WHERE note <> 'a;b';\nSELECT 1;\n"
    expect(splitSqlStatements(body)).toEqual([
      "CREATE INDEX CONCURRENTLY idx_b ON t (col) WHERE note <> 'a;b'",
      "SELECT 1",
    ])
  })
})
