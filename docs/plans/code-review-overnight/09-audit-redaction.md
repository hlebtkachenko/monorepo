---
phase: 09-audit-redaction
reviewed: 2026-05-15T00:00:00Z
depth: deep
files_reviewed: 2
files_reviewed_list:
  - packages/db/src/audit/redaction-registry.ts
  - packages/db/src/audit/query.ts
findings:
  critical: 4
  warning: 6
  info: 4
  total: 14
status: issues_found
---

# Phase 09: PII Redaction Registry + Audit Query Review

**Reviewed:** 2026-05-15
**Depth:** deep (cross-file: redact.ts, write-log.ts, get-detail.ts, tenancy.ts, schema/tool_call_log.ts, migrations/0004_audit.sql, redact-baseline.ts)
**Files Reviewed:** 2 primary + 7 cross-referenced
**Status:** issues_found

## Summary

The redaction stack has the right *shape* — two-pass baseline-key walk plus per-tool dot-paths, single source of truth in `@workspace/observability/redact-baseline`, OrganizationBoundDb brand on the audit query — but the implementation has several concrete leaks and silent-failure modes that defeat the goal of "PII never reaches `tool_call_log.input_json` or the audit timeline."

The most serious are:

1. The per-tool registry has **no enforcement** that a tool is registered before its handler writes — the ADR mentions a Section 3 test as mitigation but no such guard exists in code. A new tool that forgets `registerToolRedactions` writes IBANs and `counterparty_iban`-style fields to a 10-year retention table with only baseline redaction.
2. `applyRedactions` (consumed by `writeToolCallLog`) **silently no-ops on a non-array wildcard** instead of throwing. `lines.*.iban` against `{lines: {0: {...}, 1: {...}}}` (object-keyed instead of array) leaves the IBANs raw. There is no test for this case.
3. The audit timeline query does the `ilike(tool_name, %${filters.toolName}%)` substring filter against an unbounded user-supplied string, which combined with the trigram index `tool_call_log_tool_name_trgm_idx` makes wildcards in `toolName` (e.g. `%`) match every row — there is no length cap, no character whitelist, and no rejection of `%`/`_` SQL LIKE metacharacters. Not SQL injection (Drizzle parameterizes), but a trivial filter-bypass and a confused-deputy where a user passing `%` reads every audit row their org has.
4. `getAuditDetail` returns raw `inputJson` + `outputJson` to the caller with **no authorization signal** for non-admin actors — defense-in-depth here means RLS scopes by org, but inside an org any caller who reaches the bound transaction can read any row's redacted payload. There is no role check (workspace member vs. admin), no actor-vs-row filter (a member should not necessarily see another member's tool calls in a multi-actor org), and no logging of who fetched the detail. ADR-0011 frames this as "compliance and incident response," but the detail endpoint is the highest-value PII surface in the whole codebase and ships with the read door open to every org member.

Bug count: 4 BLOCKER, 6 WARNING, 4 INFO. Several findings depend on the consuming server action / tRPC procedure layer that wasn't supplied — the BLOCKERs assume the database layer is the last line of defense, which is exactly how a defense-in-depth file should be reviewed.

## Critical Issues

### CR-01: Audit detail endpoint has no actor-level authorization — every org member can read every tool call's redacted payload (BLOCKER)

**File:** `packages/db/src/audit/get-detail.ts:32-78` (consumed by callers of `listAuditTimeline` + `getAuditDetail` in `query.ts:23`)
**Issue:** `getAuditDetail` takes `OrganizationBoundDb` and returns `inputJson` + `outputJson` to the caller. RLS scopes by `organization_id`, so any tx bound to org X cannot see org Y's rows — good. But within org X there is no further authorization: a `member`-role user, a `guest`-role user, or an `agent`-role user (see `organizationRole` enum: `owner | admin | member | agent | guest`) all reach the same payload via the same query.

Two concrete leak paths:

1. The redaction pipeline is **best-effort**. A tool that emits a sensitive field NOT in the baseline (e.g. `counterparty_iban`, `tax_id_raw`, `birth_date`, `personal_address`) AND forgets `registerToolRedactions` will land that field in `input_json` un-redacted. The detail endpoint then serves that raw payload to anyone in the org with read access to the audit timeline.
2. The `rationale` column is a free-form `text` field set by `updateToolCallLogOutput`, never run through any redactor, and returned raw by `getAuditDetail` at line 47/74. AI tool handlers can — and historically do — paste user-supplied or AI-generated commentary including names, account numbers, or quoted source text into `rationale`. That field is a documented PII channel that bypasses the redaction stack entirely.

**Fix:**

```typescript
// In get-detail.ts — require explicit caller role + log every detail read.
export interface AuditDetailRequest {
  organizationId: string
  id: string
  callerRole: "owner" | "admin"  // workspace-tier roles only
  callerUserId: string
}

export async function getAuditDetail(
  tx: OrganizationBoundDb,
  req: AuditDetailRequest,
): Promise<AuditDetail | null> {
  if (req.callerRole !== "owner" && req.callerRole !== "admin") {
    throw new Error("getAuditDetail: requires owner or admin role")
  }
  // ... existing query ...
  // Write an audit_event row recording the detail access.
  await writeAuditEventDetailRead(tx, { auditRowId: req.id, by: req.callerUserId })
  return result
}
```

Additionally, run `rationale` through `applyBaselineKeyRedactions` (after wrapping in a synthetic `{rationale: "..."}` object) in `updateToolCallLogOutput` before persisting, OR document explicitly that `rationale` MUST NOT contain PII and add an ESLint rule for callers.

### CR-02: `ilike(tool_name, %${filters.toolName}%)` accepts SQL LIKE metacharacters from user input — filter bypass (BLOCKER)

**File:** `packages/db/src/audit/query.ts:37-39`
**Issue:**

```typescript
if (filters.toolName) {
  whereClauses.push(ilike(tool_call_log.tool_name, `%${filters.toolName}%`))
}
```

`filters.toolName` is a user-supplied string with zero validation. Passing `%` makes `%%%` match every tool name; passing `_` matches any single char. This is not SQL injection — Drizzle parameterizes — but it is a **filter-bypass attack** where a user who is allowed to query "their own tool calls" by name can pass `%` to enumerate every tool call in the org, including auto-applied AI ones they would never normally see surfaced in their UI. Combined with the missing actor-level authorization in CR-01, this is a real read amplification.

It is also an unbounded-length input: a 10MB string passed in `toolName` builds a 10MB+2-byte query and forces the trigram index to attempt the match, which is a denial-of-service surface.

**Fix:**

```typescript
if (filters.toolName) {
  if (filters.toolName.length > 64) {
    throw new Error("listAuditTimeline: toolName filter exceeds 64 chars")
  }
  // tool_name in the registry is [a-z_][a-z0-9_.]+ — anchor input to that grammar.
  if (!/^[a-z][a-z0-9_.]*$/i.test(filters.toolName)) {
    throw new Error("listAuditTimeline: toolName must be a valid tool identifier")
  }
  whereClauses.push(ilike(tool_call_log.tool_name, `%${filters.toolName}%`))
}
```

Best practice: replace `ilike` with `eq(tool_name, filters.toolName)` unless prefix-matching is a documented product requirement. The trigram index is fine for indexed search but you do not need a wildcard surface for a column with a finite registry of values.

### CR-03: `applyRedactions` silently no-ops when wildcard hits a non-array — PII leaks through object-keyed collections (BLOCKER)

**File:** `packages/db/src/audit/redact.ts:49-62` (consumed by `writeToolCallLog` in `write-log.ts:79`; declared as the per-tool redaction path mechanism by `redaction-registry.ts`)
**Issue:** The wildcard branch:

```typescript
if (head === "*") {
  if (Array.isArray(node)) {
    for (const el of node) { ... }
  }
  // Wildcards on non-arrays are ignored.
  return
}
```

A tool registering `lines.*.iban` expects every `lines` collection to be scrubbed. If a tool author passes `lines` as an object map (`{0: {iban: "CZ..."}, 1: {iban: "CZ..."}}` — common when serializing a `Map` via `Object.fromEntries`, or when the field is a dict keyed by line ID), the wildcard match fails silently, the IBAN is written raw to `tool_call_log.input_json`, and the operator sees nothing.

The same issue affects `applyRedactions` when `head` is missing from `obj` at an intermediate step: `lines.*.iban` against `{transactions: [{iban: "..."}]}` (tool author renamed `lines` to `transactions`) silently no-ops with no warning. The per-tool path is now stale because the tool's schema evolved, and no test catches it because the test (`redaction.test.ts:100-107`) only covers the exact-match-array case.

**Fix:** Log (to stderr or via the observability logger) every wildcard miss in non-production, and add an `unsafe_strict` mode that throws on miss. In production, at minimum count the misses to a metric.

```typescript
if (head === "*") {
  if (Array.isArray(node)) {
    for (const el of node) { ... }
  } else if (typeof node === "object" && node !== null) {
    // Object-keyed collection: walk every value, same as array.
    for (const el of Object.values(node)) {
      if (isLast) continue
      redactPath(el, segments, index + 1)
    }
  }
  return
}
```

The intent of `lines.*` is "every element of the collection at `lines`," not "every element of the array at `lines`." Treating object-keyed maps the same way closes the leak. Also add a test fixture with a `Map.entries()`-shaped payload.

### CR-04: No registry-completeness gate — a tool that forgets `registerToolRedactions` writes raw payloads to 10-year retention (BLOCKER)

**File:** `packages/db/src/audit/redaction-registry.ts:24-41` + `packages/db/src/audit/write-log.ts:78-79`
**Issue:** `writeToolCallLog` happily accepts `input.redactForAudit` as `undefined` (it is optional in `WriteLogInput`) and proceeds with baseline-only redaction. The default behavior when a field is NOT in the registry is "returned raw" — the opposite of safe-by-default per the prompt's check #3.

The ADR mentions "a Section 3 pgTap test asserting every tool registered in the codebase has a redaction entry" as the mitigation (`docs/adr/0011-audit-log.md:160-161`), but no such test exists in the repo (the only test file is `packages/db/tests/redaction.test.ts` and it does not enumerate the tool registry). There is also no ESLint rule, no startup-time assertion, and no migration check.

Result: any future tool can land in main with PII flowing to the 10-year audit table. Reviewer-discipline is the only gate, and reviewer-discipline is not a defense.

**Fix:** Add a runtime assertion at boot time. Each tool registry entry should provide its name AND its redaction paths in a single declaration, and the boot path should iterate the tool registry and assert `registry.has(toolName)` for each one:

```typescript
// packages/db/src/audit/redaction-registry.ts
export function assertRegistryCoversTools(toolNames: readonly string[]): void {
  const missing = toolNames.filter((t) => !registry.has(t))
  if (missing.length > 0) {
    throw new Error(
      `redaction-registry: tools without redaction declarations: ${missing.join(", ")}`,
    )
  }
}
```

Call this from the same entrypoint that wires the tool catalog. Combine with a `default: throw` in `writeToolCallLog` if `redactForAudit` is undefined AND the tool name is not on a documented allow-list of "no-PII-by-construction" tools.

## Warnings

### WR-01: `_resetForTests` env check uses string compare to `"production"` — drift-prone (WARNING)

**File:** `packages/db/src/audit/redaction-registry.ts:63-68`
**Issue:** `process.env["NODE_ENV"] === "production"` misses `"prod"`, `"PRODUCTION"`, and the (admittedly unusual) case where `NODE_ENV` is unset and the process is in fact deployed. The registry can be cleared in any non-`production` env, including staging.

**Fix:** Invert the test — refuse to clear unless explicitly allowed via a test-only env flag (e.g., `VITEST` or `NODE_ENV === "test"`):

```typescript
export function _resetForTests(): void {
  const env = process.env["NODE_ENV"]
  if (env !== "test" && !process.env["VITEST"]) {
    throw new Error("_resetForTests is only available in test environment")
  }
  registry.clear()
}
```

### WR-02: Idempotency check on registry uses `Set` size + every — quadratic for accidental large declarations and silently order-dependent on bigint paths (WARNING)

**File:** `packages/db/src/audit/redaction-registry.ts:30-38`
**Issue:** Cosmetic — the `Set` equality is sound, but the error message "different paths" gives the developer no signal as to WHICH paths differ. Debugging a registry drift across two `defineTool` call sites would require a diff in head. Same set-comparison shows up in real bugs (a transitive import re-registering the same tool with a typo). Drift here is reviewer-visible only.

**Fix:**

```typescript
const onlyInA = [...a].filter((p) => !b.has(p))
const onlyInB = [...b].filter((p) => !a.has(p))
throw new Error(
  `redaction-registry: tool '${toolName}' drift — ` +
    `previously registered: [${onlyInA.join(", ")}]; ` +
    `now attempting: [${onlyInB.join(", ")}]`,
)
```

### WR-03: `applyRedactions` does not redact array elements when path itself is `lines.*` (trailing wildcard) (WARNING)

**File:** `packages/db/src/audit/redact.ts:52-56`
**Issue:** The code documents this as "intentional" — "rejecting silently so callers declare the exact field" — but the rejection is invisible. A tool author writes `lines.*` expecting "redact every line" and gets nothing. There is no warning, no test coverage of this case, and no link from the doc-comment to a test fixture. The behavior should fail-loud at registry time, not silently drop the path.

**Fix:** Validate at `registerToolRedactions` (or in `applyRedactions` on first use):

```typescript
for (const path of paths) {
  const segments = path.split(".").filter((s) => s.length > 0)
  if (segments[segments.length - 1] === "*") {
    throw new Error(
      `redaction-registry: trailing wildcard not allowed in path '${path}'. ` +
        `Declare the exact field to redact (e.g., '${path}.<field>').`,
    )
  }
}
```

### WR-04: `confidence` is stored as numeric(5,2) but parsed back via `Number(r.confidence)` in `query.ts` — precision loss for AI scores (WARNING)

**File:** `packages/db/src/audit/query.ts:84`
**Issue:** `confidence: r.confidence != null ? Number(r.confidence) : null` — the column is `numeric(5,2)` (1.00 to 99.99 typical range), so the precision loss is fine for display. But `write-log.ts:93` writes the value via `String(input.confidence.toFixed(2))` which is a string-of-a-float — already vulnerable to floating-point rounding (`0.575.toFixed(2)` may return `"0.58"` or `"0.57"` depending on platform). For an audit-grade column that drives "auto_applied" thresholds elsewhere, this round-trip degrades trust.

**Fix:** Receive `confidence` as a `string` (e.g., `"0.85"`) at the writer boundary so callers do not pass floats, OR import a decimal library. For a 5,2 scale the simplest correct path is to multiply by 100 at the boundary and store an integer.

### WR-05: `pageSize` is unbounded — caller can request `pageSize: 1_000_000` and OOM the API (WARNING)

**File:** `packages/db/src/audit/query.ts:50, 67`
**Issue:** `Math.max(1, pageSize)` floors the value but never caps it. A caller can request `pageSize: 100000` and get a 100k-row response. The audit timeline rows include `tool_name` (up to a typed limit) and timestamps — not massive, but multiplied by the per-org index scan and serialization, this is a trivial DoS surface from any authenticated org member.

**Fix:**

```typescript
const MAX_PAGE_SIZE = 200
const effectivePageSize = Math.min(MAX_PAGE_SIZE, Math.max(1, pageSize))
const offset = Math.max(0, pageIndex) * effectivePageSize
// ... use effectivePageSize in .limit() ...
```

Same applies to `getAuditDetail`'s caller boundary — though detail is a single row, it deserves a max payload size check on `input_json` / `output_json` if they can grow unbounded.

### WR-06: `dateFrom` / `dateTo` parsed with `new Date(...)` — silent NaN for malformed input (WARNING)

**File:** `packages/db/src/audit/query.ts:41, 44`
**Issue:** `new Date("not-a-date")` is `Invalid Date` (a Date instance whose `.getTime()` is NaN). Passing that to `gte`/`lte` produces a query that PostgreSQL will reject with a runtime error — but the error is generic and the caller has no signal which field was malformed. Worse, `new Date("2026-13-01")` may roll over in some browser-style date strings.

**Fix:** Parse with explicit validation:

```typescript
function parseISODateOrThrow(field: string, value: string): Date {
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) {
    throw new Error(`listAuditTimeline: ${field} is not a valid ISO date`)
  }
  return d
}
// ...
whereClauses.push(gte(tool_call_log.created_at, parseISODateOrThrow("dateFrom", filters.dateFrom)))
```

## Info

### IN-01: `getAllRedactions` builds a plain record via `Object.fromEntries(registry)` — caller can mutate the returned readonly arrays' container

**File:** `packages/db/src/audit/redaction-registry.ts:55-57`
**Issue:** The inner arrays are `Object.freeze`d (line 40), but the returned record itself is mutable. A pino bridge caller doing `out["new_tool"] = ["password"]` does not affect the registry, but it does affect any other concurrent caller holding the same record. Defensive — copy at boundary.

**Fix:** `return Object.fromEntries([...registry.entries()].map(([k, v]) => [k, [...v]]))` — fully defensive copy.

### IN-02: `query.ts` imports `count` but the `totalRows` query runs as a second roundtrip — could be `tx.$count(...)` or a window function

**File:** `packages/db/src/audit/query.ts:70-75`
**Issue:** Two separate round-trips (`select rows`, `select count`) when one window-function query would suffice. Performance is out of scope for v1 but for audit timelines on a 10-year retention table this is the right place to use `count(*) over () AS total` in the same SELECT.

**Fix:** Optional — defer to v2 once the timeline ships and performance shows up in a trace.

### IN-03: Doc comments mention `getAuditDetail` from `query.ts` line 10 but the function lives in `get-detail.ts`

**File:** `packages/db/src/audit/query.ts:9-11`
**Issue:** Minor — the body of `query.ts` says "The click-through drawer fetches them via `getAuditDetail`" but does not import or reference it. Fine as a doc cross-ref, but a reader scanning the file alone has no link.

**Fix:** Either inline the function (rejected, separation is correct) or add an explicit module-level cross-reference:

```typescript
/**
 * ...
 * For full row including `input_json` and `output_json`, see
 * `./get-detail.ts#getAuditDetail`.
 */
```

### IN-04: `write-log.ts:135-138` type assertion `Parameters<typeof tx.update>[0] extends never ? never : typeof updates` is dead complexity

**File:** `packages/db/src/audit/write-log.ts:134-138` (not primary file but exposed by deep review)
**Issue:** This ternary always evaluates to `typeof updates` because `Parameters<typeof tx.update>[0]` is never `never` in any concrete Drizzle version. The cast is acting as `as Record<string, unknown>` with extra steps, which is fine but reads as if a real type-safety constraint is enforced. Either drop the ternary or replace it with a concrete `Partial<typeof tool_call_log.$inferInsert>` cast.

**Fix:** Simplify to a single typed cast. Audit writers are infrastructure code — clarity wins over apparent type acrobatics.

---

## Cross-cutting observations (not findings, context for the fixer)

- **Salt / hash / mask:** the redaction is exclusively **type erasure** (`"[REDACTED]"`), no hashing, no masking, no per-row salting. This is the **correct** choice for a 10-year retention table where the goal is "no recovery possible." A hash with a deterministic salt would enable correlation attacks (same email = same hash across rows). A mask (`"j***@example.com"`) leaks the domain. Type erasure to a constant string is what GDPR Article 5(1)(c) asks for. No finding.
- **RLS:** the query goes through `OrganizationBoundDb`, not `withAdminBypass`. Good. The branded type makes it a compile error to pass a raw `db` handle. No finding on the wrapper choice itself — but see CR-01 for the actor-level authorization gap.
- **SQL injection:** none in the two primary files. Drizzle's tagged-template builder parameterizes everything. The `ilike` pattern uses template-literal interpolation on the JS side (`%${filters.toolName}%`) but the resulting string is bound, not interpolated, into the SQL. The CR-02 finding is LIKE-metacharacter abuse, not injection.
- **Logging of redaction failures:** there is no logging at all in `redact.ts` / `redaction-registry.ts`. A failure to redact (e.g., the CR-03 silent-noop) does NOT leak the original to logs because there is no logging — but it also gives operators no visibility that redaction was incomplete. The trade-off is correct (better silent than leaking) but the visibility gap is real (see CR-03 fix).
- **TypeScript:** no `any` in either primary file. The `as unknown as OrganizationBoundDb` cast in `tenancy.ts` is the documented brand-construction site, not a type-erasure bug. Schema column types match the type definitions in `types.ts`. No finding.

---

_Reviewed: 2026-05-15_
_Reviewer: Claude (gsd-code-reviewer)_
_Depth: deep_
