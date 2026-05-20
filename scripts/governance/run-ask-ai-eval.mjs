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
 *   ASK_AI_URL   — base URL of the preview deploy (e.g.
 *                  https://docs-preview.afframe.com). Required.
 *   ASK_AI_THRESHOLD — citation pass-rate, default 0.85.
 */

import { readFileSync } from "node:fs"
import { resolve } from "node:path"

const URL_BASE = process.env.ASK_AI_URL
if (!URL_BASE) {
  process.stderr.write("ASK_AI_URL is required\n")
  process.exit(2)
}
const THRESHOLD = Number(process.env.ASK_AI_THRESHOLD ?? "0.85")

const evalPath = resolve(process.cwd(), "apps/docs/lib/ai/eval.ts")
const evalSource = readFileSync(evalPath, "utf8")
const cases = extractCases(evalSource)

let cited = 0
let containsHits = 0
let containsExpected = 0
const failures = []

for (const c of cases) {
  const res = await fetch(`${URL_BASE}/api/ask`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ question: c.q }),
  })
  const text = await readStream(res)
  const hasCitation = c.cite.every((p) => text.includes(p))
  if (hasCitation) cited++
  let hits = 0
  for (const sub of c.contains ?? []) {
    if (text.toLowerCase().includes(sub.toLowerCase())) hits++
  }
  containsHits += hits
  containsExpected += c.contains?.length ?? 0
  if (!hasCitation || hits < (c.contains?.length ?? 0)) {
    failures.push({ q: c.q, want_cite: c.cite, got: text.slice(0, 200) })
  }
}

const citeRate = cited / cases.length
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

function extractCases(src) {
  // Trivial parser: `eval.ts` exports `EVAL_SET: EvalCase[] = [...]`. We
  // pull each `{ q: "...", cite: [...], contains?: [...] }` block by
  // regex — good enough for a known-shape table maintained in this repo.
  const out = []
  const re =
    /\{\s*q:\s*"([^"]+)",\s*cite:\s*\[([^\]]*)\](?:,\s*contains:\s*\[([^\]]*)\])?\s*\}/g
  let m
  while ((m = re.exec(src)) !== null) {
    out.push({
      q: m[1],
      cite: parseList(m[2]),
      contains: m[3] ? parseList(m[3]) : undefined,
    })
  }
  return out
}

function parseList(s) {
  return s
    .split(",")
    .map((x) => x.trim().replace(/^"/, "").replace(/"$/, ""))
    .filter(Boolean)
}
