/**
 * Per-tool redaction registry.
 *
 * Tools register their per-field redaction paths at module load time (typically
 * in the same file that calls `defineTool`). The pino bridge in
 * `@workspace/observability/logger` calls `configureToolRedactions(getAllRedactions())`
 * to combine with the baseline.
 *
 * Why a module-scoped Map and not DI? Tools are static at compile time; their
 * redaction declarations are static. A Map is simpler than DI and matches the
 * de facto pattern (declarations co-located with tool definitions).
 *
 * Idempotent: registering the same tool with identical paths is a no-op.
 * Registering with different paths throws to surface accidental drift between
 * two call sites for the same tool name.
 */

const registry = new Map<string, readonly string[]>()

/**
 * Register per-tool redaction paths. Idempotent: same paths = no-op;
 * different paths = throw.
 */
export function registerToolRedactions(
  toolName: string,
  paths: readonly string[],
): void {
  const existing = registry.get(toolName)
  if (existing) {
    if (
      existing.length !== paths.length ||
      existing.some((p, i) => p !== paths[i])
    ) {
      throw new Error(
        `redaction-registry: tool '${toolName}' already registered with different paths`,
      )
    }
    return
  }
  registry.set(toolName, Object.freeze([...paths]))
}

/**
 * Get the registered redaction paths for a single tool. Returns an empty
 * array if the tool has not been registered.
 */
export function getToolRedactions(toolName: string): readonly string[] {
  return registry.get(toolName) ?? []
}

/**
 * Get all registered redaction paths as a plain record. Used by the pino
 * bridge to build the full `redact.paths` list at boot.
 */
export function getAllRedactions(): Record<string, readonly string[]> {
  return Object.fromEntries(registry)
}

/**
 * Reset the registry to an empty state. Only available outside production.
 * Tests that need a clean registry call this in their `beforeEach`.
 */
export function _resetForTests(): void {
  if (process.env["NODE_ENV"] === "production") {
    throw new Error("_resetForTests must not be called in production")
  }
  registry.clear()
}
