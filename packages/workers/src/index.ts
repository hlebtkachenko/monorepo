/**
 * @workspace/workers — pg-boss job queue wrappers.
 *
 * Identity:
 *   - pg-boss is the only queue. No BullMQ, no Redis. See ADR-0017.
 *   - Jobs live in Postgres schema `pgboss.*` (DDL applied via migration
 *     packages/db/migrations/0007_pgboss.sql).
 *   - The runtime pg-boss connection must be DIRECT (port 5432), NOT
 *     through pgBouncer transaction mode. pg-boss uses advisory locks
 *     and LISTEN/NOTIFY semantics that pgBouncer transaction mode
 *     does not preserve.
 *
 * Public API:
 *   - boot(connectionString)        -> Boss instance, lanes registered
 *   - registerLane(lane)            -> add a lane to the registry
 *   - getLane(name)                 -> retrieve a registered lane by name
 *   - hasLane(name) / laneNames()   -> registry introspection
 *
 * See also:
 *   - ADR-0017 (workers/pg-boss only)
 *   - ADR-0018 (three-layer authz — permissions-drain lane)
 */

export { boot, type WorkersBoot } from "./boot"
export {
  registerLane,
  getLane,
  hasLane,
  laneNames,
  resetLaneRegistryForTests,
  type Lane,
  type LaneHandler,
} from "./lanes/registry"
