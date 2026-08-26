/**
 * The process boundary, and nothing else. Every decision lives in
 * `src/program.ts`, which returns an exit code instead of taking one.
 */
import { run } from "./program"

process.exitCode = await run(process.argv.slice(2), process.env, {
  write: (line) => process.stdout.write(`${line}\n`),
})
