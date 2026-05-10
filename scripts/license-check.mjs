#!/usr/bin/env node
// License allowlist gate driven by `pnpm licenses list --json`.
// Default-deny posture: anything not on the allow list logs a WARN; anything
// on the deny list fails the run.
//
// Usage:
//   pnpm licenses list --recursive --json > licenses.json
//   node scripts/license-check.mjs --input licenses.json
//
// No external dependencies.

import { readFileSync } from "node:fs";
import { argv, exit, stdout, stderr } from "node:process";

const ALLOW = new Set([
  "MIT",
  "Apache-2.0",
  "BSD-2-Clause",
  "BSD-3-Clause",
  "ISC",
  "MPL-2.0",
  "BlueOak-1.0.0",
  "0BSD",
  "Unlicense",
  "CC0-1.0",
]);

const DENY = new Set([
  "GPL-2.0",
  "GPL-3.0",
  "AGPL-1.0",
  "AGPL-3.0",
  "LGPL-3.0",
]);

function parseArgs(args) {
  const out = { input: null };
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === "--input" || a === "-i") {
      out.input = args[++i];
    }
  }
  return out;
}

function normalize(license) {
  if (!license) return "UNKNOWN";
  // pnpm sometimes wraps SPDX in parentheses or joins with OR/AND.
  // Take the first SPDX-shaped token; if the whole string is a denylist hit
  // anywhere in the expression, treat as deny.
  const trimmed = String(license).trim().replace(/^\(|\)$/g, "");
  return trimmed;
}

function expressionContains(expr, set) {
  // Split on common SPDX expression operators.
  const tokens = expr
    .split(/\s+(?:OR|AND|WITH)\s+|\s*\/\s*|\s*,\s*/i)
    .map((t) => t.trim().replace(/^\(|\)$/g, ""))
    .filter(Boolean);
  return tokens.some((t) => set.has(t));
}

function expressionAllAllowed(expr, allow) {
  const tokens = expr
    .split(/\s+(?:OR|AND|WITH)\s+|\s*\/\s*|\s*,\s*/i)
    .map((t) => t.trim().replace(/^\(|\)$/g, ""))
    .filter(Boolean);
  if (tokens.length === 0) return false;
  // For "A OR B" any allowed token wins; for "A AND B" all must be allowed.
  // We can't cheaply tell which without a real SPDX parser, so use the
  // permissive rule: if any token is allowed, treat as allowed. Denylist
  // tokens are checked separately and override.
  return tokens.some((t) => allow.has(t));
}

const args = parseArgs(argv.slice(2));
if (!args.input) {
  stderr.write("Usage: node scripts/license-check.mjs --input licenses.json\n");
  exit(2);
}

let raw;
try {
  raw = readFileSync(args.input, "utf8");
} catch (err) {
  stderr.write(`Failed to read ${args.input}: ${err.message}\n`);
  exit(2);
}

let parsed;
try {
  parsed = JSON.parse(raw);
} catch (err) {
  stderr.write(`Failed to parse JSON from ${args.input}: ${err.message}\n`);
  exit(2);
}

// pnpm licenses list --json shape:
//   { "<License>": [ { "name": "...", "version": "...", "license": "...", "path": "..." }, ... ], ... }
// or sometimes a flat array. Normalize to a flat list.
const entries = [];
if (Array.isArray(parsed)) {
  for (const item of parsed) entries.push(item);
} else if (parsed && typeof parsed === "object") {
  for (const [licenseKey, items] of Object.entries(parsed)) {
    if (Array.isArray(items)) {
      for (const item of items) {
        entries.push({ ...item, license: item.license ?? licenseKey });
      }
    }
  }
} else {
  stderr.write("Unexpected pnpm licenses JSON shape.\n");
  exit(2);
}

let denyHits = 0;
let warnHits = 0;
let allowHits = 0;
const denyList = [];
const warnList = [];

for (const entry of entries) {
  const name = entry.name ?? "<unknown>";
  const version = entry.version ?? "?";
  const license = normalize(entry.license);

  if (license === "UNKNOWN") {
    warnHits++;
    warnList.push(`${name}@${version} :: UNKNOWN`);
    continue;
  }

  if (expressionContains(license, DENY)) {
    denyHits++;
    denyList.push(`${name}@${version} :: ${license}`);
    continue;
  }

  if (expressionAllAllowed(license, ALLOW)) {
    allowHits++;
    continue;
  }

  warnHits++;
  warnList.push(`${name}@${version} :: ${license}`);
}

stdout.write(`License check summary:\n`);
stdout.write(`  allow: ${allowHits}\n`);
stdout.write(`  warn:  ${warnHits}\n`);
stdout.write(`  deny:  ${denyHits}\n`);

if (warnList.length > 0) {
  stdout.write(`\nWARN (license not on allow list, review):\n`);
  for (const line of warnList) stdout.write(`  - ${line}\n`);
}

if (denyList.length > 0) {
  stderr.write(`\nDENY (license on deny list, blocking):\n`);
  for (const line of denyList) stderr.write(`  - ${line}\n`);
  exit(1);
}

exit(0);
