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
 * Register per-tool redaction paths. Idempotent: same set of paths = no-op
 * (order does not matter); different set = throw.
 */
export function registerToolRedactions(
  toolName: string,
  paths: readonly string[],
): void {
  // Reject paths whose final segment is "*". A trailing wildcard would
  // redact the entire array/object element, which is never what the
  // caller wants (use the explicit field instead). Catching at
  // registration time surfaces the bug as a boot error instead of
  // silently no-oping at write time.
  for (const path of paths) {
    if (!path) continue
    const segments = path.split(".").filter((s) => s.length > 0)
    if (segments.length === 0) continue
    if (segments[segments.length - 1] === "*") {
      throw new Error(
        `redaction-registry: tool '${toolName}' path '${path}' ends in '*'; declare the exact field instead`,
      )
    }
  }
  const existing = registry.get(toolName)
  if (existing) {
    const a = new Set(existing)
    const b = new Set(paths)
    const sameSet = a.size === b.size && [...a].every((p) => b.has(p))
    if (!sameSet) {
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
 * Reset the registry to an empty state. Only available when explicitly
 * running tests (NODE_ENV=test or VITEST set). Inverting the env compare
 * is intentional: defaulting to "allow unless prod" lets a misconfigured
 * NODE_ENV in staging clear the registry at runtime.
 */
export function _resetForTests(): void {
  const isTest =
    process.env["NODE_ENV"] === "test" || process.env["VITEST"] === "true"
  if (!isTest) {
    throw new Error("_resetForTests is only callable in NODE_ENV=test")
  }
  registry.clear()
}
