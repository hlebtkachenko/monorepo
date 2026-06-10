/**
 * SQL statement splitter for the outside-transaction migration path
 * (CREATE INDEX CONCURRENTLY / ALTER TYPE ... ADD VALUE — Postgres forbids
 * these inside a transaction block, so the runner executes them one by one).
 *
 * DB-08 fix: the previous inline splitter dropped any CHUNK that *started
 * with* `--`. Every migration in this repo prefixes statements with comment
 * blocks, so a statement written as `-- comment\nCREATE INDEX CONCURRENTLY …`
 * was one chunk starting with `--` and the SQL after the comment was silently
 * skipped (then journaled as applied). We now strip comment LINES first and
 * only then drop empty chunks.
 *
 * Known remaining limitation (TODO B1 in apply-migrations.ts): splitting on
 * `;\s*\n` can corrupt DO-blocks that contain `;\n` inside their body, and
 * comment-line stripping would also drop a line beginning with `--` inside a
 * multi-line string literal or `$$` body. No outside-transaction migration
 * uses either construct today; a real SQL parser is the fix if one ever does.
 */
export function splitSqlStatements(body: string): string[] {
  return body
    .split(/;\s*\n/)
    .map((chunk) =>
      chunk
        .split("\n")
        .filter((line) => !line.trimStart().startsWith("--"))
        .join("\n")
        .trim(),
    )
    .filter((stmt) => stmt.length > 0)
}
