#!/usr/bin/env node
// SBOM diff gate. Compares two CycloneDX 1.6 JSON SBOMs and an osv-scanner
// JSON results file. Exits non-zero on:
//   (a) any added component carrying a GPL/AGPL/LGPL license, or
//   (b) any added component with a HIGH or CRITICAL CVE in the osv-scanner
//       results.
//
// Usage:
//   node scripts/sbom-diff.mjs <prev.cdx.json> <curr.cdx.json> <osv-results.json>
//
// No external dependencies.

import { readFileSync } from "node:fs";
import { argv, exit, stdout, stderr } from "node:process";

const COPYLEFT_PREFIXES = ["GPL-", "AGPL-", "LGPL-"];
const HIGH_SEVERITIES = new Set(["HIGH", "CRITICAL"]);

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (err) {
    stderr.write(`Failed to read or parse ${path}: ${err.message}\n`);
    exit(2);
  }
}

function purlOrKey(component) {
  if (component.purl) return component.purl;
  const name = component.name ?? "<unknown>";
  const version = component.version ?? "0.0.0";
  return `${name}@${version}`;
}

function indexComponents(sbom) {
  const map = new Map();
  const components = Array.isArray(sbom.components) ? sbom.components : [];
  for (const c of components) {
    map.set(purlOrKey(c), c);
  }
  return map;
}

function licenseStrings(component) {
  // CycloneDX license shapes:
  //   licenses: [ { license: { id: "MIT" } }, { license: { name: "..." } }, { expression: "MIT OR Apache-2.0" } ]
  const out = [];
  const licenses = component.licenses ?? [];
  for (const entry of licenses) {
    if (entry.expression) {
      out.push(String(entry.expression));
    } else if (entry.license) {
      if (entry.license.id) out.push(String(entry.license.id));
      else if (entry.license.name) out.push(String(entry.license.name));
    }
  }
  return out;
}

function isCopyleft(licenses) {
  return licenses.some((l) =>
    COPYLEFT_PREFIXES.some((prefix) => l.toUpperCase().includes(prefix)),
  );
}

function indexOsvHighSeverity(osv) {
  // osv-scanner JSON shape:
  //   { results: [ { source: {...}, packages: [ { package: { name, ecosystem, version }, vulnerabilities: [...], groups: [ { ids, max_severity } ] } ] } ] }
  const byName = new Map();
  const results = osv?.results ?? [];
  for (const r of results) {
    const packages = r.packages ?? [];
    for (const p of packages) {
      const name = p.package?.name;
      const version = p.package?.version;
      if (!name) continue;
      const key = `${name}@${version ?? "?"}`;
      const groups = p.groups ?? [];
      const vulns = p.vulnerabilities ?? [];
      // Prefer max_severity from groups when present.
      let highest = null;
      for (const g of groups) {
        const sev = (g.max_severity ?? "").toUpperCase();
        if (HIGH_SEVERITIES.has(sev)) {
          highest = sev;
          break;
        }
      }
      if (!highest) {
        for (const v of vulns) {
          const dbSev = v.database_specific?.severity;
          const sev = String(dbSev ?? "").toUpperCase();
          if (HIGH_SEVERITIES.has(sev)) {
            highest = sev;
            break;
          }
        }
      }
      if (highest) {
        const ids = vulns.map((v) => v.id).filter(Boolean);
        byName.set(key, { severity: highest, ids });
        // Also index by bare name so purl lookups still match.
        byName.set(name, { severity: highest, ids });
      }
    }
  }
  return byName;
}

const args = argv.slice(2);
if (args.length < 3) {
  stderr.write(
    "Usage: node scripts/sbom-diff.mjs <prev.cdx.json> <curr.cdx.json> <osv-results.json>\n",
  );
  exit(2);
}

const [prevPath, currPath, osvPath] = args;
const prevSbom = readJson(prevPath);
const currSbom = readJson(currPath);
const osvResults = readJson(osvPath);

const prev = indexComponents(prevSbom);
const curr = indexComponents(currSbom);
const osvIndex = indexOsvHighSeverity(osvResults);

const added = [];
const removed = [];
const versionChanges = [];

// Removed and version changes from prev -> curr.
const prevByName = new Map();
for (const [key, c] of prev) {
  if (!curr.has(key)) {
    const sameName = [...curr.values()].find((cc) => cc.name === c.name);
    if (sameName && sameName.version !== c.version) {
      versionChanges.push({ name: c.name, from: c.version, to: sameName.version });
    } else {
      removed.push(c);
    }
  }
  prevByName.set(c.name, c);
}

for (const [key, c] of curr) {
  if (!prev.has(key)) {
    const prevSame = prevByName.get(c.name);
    if (prevSame && prevSame.version !== c.version) {
      // Already captured as a version change above.
      continue;
    }
    added.push(c);
  }
}

stdout.write(`SBOM diff:\n`);
stdout.write(`  added:           ${added.length}\n`);
stdout.write(`  removed:         ${removed.length}\n`);
stdout.write(`  version changes: ${versionChanges.length}\n`);

if (added.length > 0) {
  stdout.write(`\nAdded packages:\n`);
  for (const c of added) {
    stdout.write(`  + ${c.name}@${c.version} [${licenseStrings(c).join(", ") || "no-license"}]\n`);
  }
}
if (removed.length > 0) {
  stdout.write(`\nRemoved packages:\n`);
  for (const c of removed) {
    stdout.write(`  - ${c.name}@${c.version}\n`);
  }
}
if (versionChanges.length > 0) {
  stdout.write(`\nVersion changes:\n`);
  for (const v of versionChanges) {
    stdout.write(`  ~ ${v.name}: ${v.from} -> ${v.to}\n`);
  }
}

const copyleftHits = [];
const cveHits = [];

for (const c of added) {
  const licenses = licenseStrings(c);
  if (isCopyleft(licenses)) {
    copyleftHits.push(`${c.name}@${c.version} :: ${licenses.join(", ")}`);
  }
  const byKey = osvIndex.get(`${c.name}@${c.version}`);
  const byName = osvIndex.get(c.name);
  const hit = byKey ?? byName;
  if (hit) {
    cveHits.push(`${c.name}@${c.version} :: ${hit.severity} (${(hit.ids ?? []).join(", ")})`);
  }
}

let failed = false;

if (copyleftHits.length > 0) {
  stderr.write(`\nDENY: copyleft license introduced by this PR:\n`);
  for (const line of copyleftHits) stderr.write(`  - ${line}\n`);
  failed = true;
}

if (cveHits.length > 0) {
  stderr.write(`\nDENY: high/critical CVE introduced by this PR:\n`);
  for (const line of cveHits) stderr.write(`  - ${line}\n`);
  failed = true;
}

if (failed) exit(1);
exit(0);
