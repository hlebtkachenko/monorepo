/**
 * Lane registry — central catalog of pg-boss lanes (queue + handler).
 *
 * Lanes are registered at module-load time (see ./permissions-drain.ts) and
 * activated together at boot(). Re-registering the same name throws —
 * lanes are unique by construction.
 */

import type { Job, WorkOptions } from "pg-boss"

/**
 * pg-boss v12 delivers jobs in batches. Handler receives an array; treat
 * a batch of one as the common case.
 */
export type LaneHandler<TData = unknown> = (jobs: Job<TData>[]) => Promise<void>

export interface Lane<TData = unknown> {
  readonly name: string
  readonly handler: LaneHandler<TData>
  readonly options?: WorkOptions
}

const REGISTRY = new Map<string, Lane>()

export function registerLane<TData>(lane: Lane<TData>): void {
  if (REGISTRY.has(lane.name)) {
    throw new Error(
      `Lane already registered: ${lane.name}. Lane names must be unique.`,
    )
  }
  REGISTRY.set(lane.name, lane as Lane)
}

export function getLane(name: string): Lane {
  const lane = REGISTRY.get(name)
  if (!lane) {
    throw new Error(
      `Lane not registered: ${name}. Known lanes: ${laneNames().join(", ") || "(none)"}`,
    )
  }
  return lane
}

export function hasLane(name: string): boolean {
  return REGISTRY.has(name)
}

export function laneNames(): readonly string[] {
  return [...REGISTRY.keys()]
}

/**
 * Test-only escape hatch. Clears the registry so a test suite can register
 * lanes from scratch without process restart.
 */
export function resetLaneRegistryForTests(): void {
  REGISTRY.clear()
}
