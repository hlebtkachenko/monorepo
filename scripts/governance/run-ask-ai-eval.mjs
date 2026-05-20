#!/usr/bin/env node
/**
 * Ask AI eval runner. Hits the live `/api/ask` route on a preview deploy
 * with each case from `apps/docs/lib/ai/eval.ts`, scores citations +
 * substring coverage, and writes a JSON report to stdout.
 *
 * Exit 0 when citation rate >= threshold (default 0.85) AND every
 * `contains` substring fires at least once across the run. Exit 1
 * otherwise. The CI workflow `ask-ai-eval.yml` runs this on a schedule
 * and on docs PRs.
 *
 * Env:
 *   ASK_AI_URL       — base URL of the preview deploy. Required.
 *   ASK_AI_THRESHOLD — citation pass-rate, default 0.85.
 *   ASK_AI_CONCURRENCY — parallel cases, default 5.
 *
 * Cases are imported from the canonical `EVAL_SET` in `apps/docs/lib/ai/
 * eval.ts` via `tsx`. A regex-based parser was tried first but broke on
 * questions containing escaped quotes — importing the TS gives us a
 * single source of truth and no shape brittleness.
 */

import { spawnSync } from "node:child_process"
import { resolve } from "node:path"

const URL_BASE = process.env.ASK_AI_URL
if (!URL_BASE) {
  process.stderr.write("ASK_AI_URL is required\n")
  process.exit(2)
}
const THRESHOLD = Number(process.env.ASK_AI_THRESHOLD ?? "0.85")
const CONCURRENCY = Math.max(1, Number(process.env.ASK_AI_CONCURRENCY ?? "5"))

// Load EVAL_SET via tsx so the TS module evaluates with its type elision.
// `process.argv0` is node; spawn tsx as a child to emit JSON we can read.
const dumpScript = `
import { EVAL_SET } from "${resolve(process.cwd(), "apps/docs/lib/ai/eval.ts").replace(/\\\\/g, "\\\\\\\\")}"
process.stdout.write(JSON.stringify(EVAL_SET))
`
const dump = spawnSync("npx", ["--no-install", "tsx", "-e", dumpScript], {
  encoding: "utf8",
})
if (dump.status !== 0) {
  process.stderr.write(`Failed to load EVAL_SET via tsx:\n${dump.stderr}\n`)
  process.exit(2)
}
const cases = JSON.parse(dump.stdout)

let cited = 0
let containsHits = 0
let containsExpected = 0
const failures = []

async function scoreOne(c) {
  const res = await fetch(`${URL_BASE}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: c.q }),
  })
  const text = await readStream(res)
  const hasCitation = c.cite.every((p) => text.includes(p))
  let hits = 0
  for (const sub of c.contains ?? []) {
    if (text.toLowerCase().includes(sub.toLowerCase())) hits++
  }
  return { c, text, hasCitation, hits, expected: c.contains?.length ?? 0 }
}

// Bounded-concurrency pool. 50 cases × 5 workers = 10 batches.
const queue = [...cases]
const workers = Array.from({ length: CONCURRENCY }, async () => {
  while (queue.length) {
    const c = queue.shift()
    if (!c) return
    const r = await scoreOne(c)
    if (r.hasCitation) cited++
    containsHits += r.hits
    containsExpected += r.expected
    if (!r.hasCitation || r.hits < r.expected) {
      failures.push({
        q: r.c.q,
        want_cite: r.c.cite,
        got: r.text.slice(0, 200),
      })
    }
  }
})
await Promise.all(workers)

const citeRate = cases.length ? cited / cases.length : 1
const containRate = containsExpected ? containsHits / containsExpected : 1
const passed = citeRate >= THRESHOLD && containRate >= THRESHOLD
process.stdout.write(
  JSON.stringify(
    { passed, citeRate, containRate, total: cases.length, failures },
    null,
    2,
  ) + "\n",
)
process.exit(passed ? 0 : 1)

// ───────────────────────────────────────────────────────────────────────

async function readStream(res) {
  if (!res.ok) return `HTTP ${res.status}`
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ""
  let acc = ""
  for (;;) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let nl
    while ((nl = buf.indexOf("\n\n")) !== -1) {
      const raw = buf.slice(0, nl).trim()
      buf = buf.slice(nl + 2)
      if (!raw.startsWith("data: ")) continue
      const payload = raw.slice("data: ".length)
      if (payload === "[DONE]") return acc
      try {
        const p = JSON.parse(payload)
        if (p.text) acc += p.text
      } catch {
        // Ignore malformed chunks.
      }
    }
  }
  return acc
}
