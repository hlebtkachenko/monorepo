import { AfframeApiError, RateLimitError } from "@afframe/sdk"
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js"

/** Render a JSON-serialisable payload as a single `text` content block. */
export function renderResult(payload: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: JSON.stringify(payload, null, 2) }],
  }
}

/**
 * Render an SDK error as a structured MCP tool error. Keeps the
 * Plaid envelope intact so the LLM (or end user) sees `code` and
 * `request_id`. `documentation_url` is appended when present (the api
 * does not emit it today; reserved field).
 */
export function toolError(err: unknown): CallToolResult {
  if (err instanceof RateLimitError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            `Rate limited. retry_after=${err.retryAfter ?? "?"}s ` +
            `code=${err.code} request_id=${err.requestId}` +
            (err.documentationUrl ? ` docs=${err.documentationUrl}` : ""),
        },
      ],
    }
  }
  if (err instanceof AfframeApiError) {
    return {
      isError: true,
      content: [
        {
          type: "text",
          text:
            `[${err.code}] ${err.message} ` +
            `(status=${err.status} request_id=${err.requestId})` +
            (err.documentationUrl ? ` docs=${err.documentationUrl}` : ""),
        },
      ],
    }
  }
  return {
    isError: true,
    content: [{ type: "text", text: (err as Error).message }],
  }
}
