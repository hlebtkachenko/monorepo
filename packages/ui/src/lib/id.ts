/**
 * Generate a random ID with a fallback for older browsers / insecure contexts
 * where crypto.randomUUID is unavailable.
 *
 * For React component IDs, prefer React.useId() which is SSR-stable.
 */
export function makeId(prefix = "id"): string {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}-${crypto.randomUUID()}`
  }
  return `${prefix}-${Math.random().toString(36).slice(2, 11)}`
}
