# @workspace/observability

Logging + structured redaction shared between application code and the audit
trail. Source-of-truth for which keys and paths are sensitive.

## Why this package exists

The audit log and the live pino logger must agree on what counts as PII. If
they diverge, a secret redacted from one sink leaks via the other. Both
import their baseline rules from this package; there is no other source of
the baseline list.

## Public surface

```ts
import {
  BASELINE_REDACT_PATHS,
  BASELINE_REDACT_KEYS,
  redactMeta,           // cycle-safe walker for alert metadata
  configureToolRedactions,  // wire per-tool paths from @workspace/db/audit
  logger,               // pino instance, redact-configured
} from "@workspace/observability"
```

## Dependency direction

`@workspace/observability` **does not import from `@workspace/db`**. The
direction is db → observability only. Adding a `@workspace/db` import here
would create a circular dependency and break the audit redaction pipeline at
build time. ESLint does not enforce this; reviewers must catch it.

## Layout

```
src/
  redact-baseline.ts     # BASELINE_REDACT_PATHS + KEYS
  redact-meta.ts         # cycle-safe alert meta walker
  logger.ts              # pino + configureToolRedactions
  index.ts               # barrel
```

## Design references

- ADR-0011 — Audit log (two-pass redaction; baseline runs first, per-tool second)
- ADR-0002 — Observability stack (Honeycomb traces)
