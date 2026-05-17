# @workspace/workers

Background job queue built on [pg-boss](https://github.com/timgit/pg-boss). Jobs are persisted in the `pgboss.*` Postgres schema — no Redis, no external broker. See ADR-0017.

## Entry points

```ts
// Start the queue and bind all registered lanes
import { boot, type WorkersBoot } from "@workspace/workers"

// Lane registry introspection
import {
  registerLane,
  getLane,
  hasLane,
  laneNames,
  type Lane,
  type LaneHandler,
} from "@workspace/workers"

// Start the queue (used in the worker process entrypoint)
import { boot } from "@workspace/workers/boot"

// Individual lane modules (register themselves at import time)
import "@workspace/workers/lanes/permissions-drain"
```

## What it does

- `boot(connectionString)` — starts pg-boss and binds every lane in the registry. Returns a `WorkersBoot` handle with `boss` and `stop()`.
- `registerLane(lane)` — add a named queue + handler pair. Throws if the name is already registered.
- `permissions-drain` lane — reads `permissions_outbox` rows (SELECT FOR UPDATE SKIP LOCKED) and writes/deletes OpenFGA tuples, implementing ADR-0018 L2 authz propagation.

## Connection requirement

The pg-boss connection string MUST be a direct Postgres URL (port 5432). pgBouncer transaction mode breaks advisory locks and LISTEN/NOTIFY semantics that pg-boss relies on.

## Design references

- ADR-0017 — Workers: pg-boss only
- ADR-0018 — Three-layer authz (permissions-drain lane)
