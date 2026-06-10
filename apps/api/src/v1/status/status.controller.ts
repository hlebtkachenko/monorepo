import { Controller, Get } from "@nestjs/common"
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger"
import type { StatusResponse } from "@workspace/shared/api"

/**
 * `GET /v1/status` — service health summary.
 *
 * Proxies the OpenStatus public-status endpoint at `status.afframe.com`
 * when reachable. Falls back to a synthesized `operational` response
 * when the status page is unreachable or has not been deployed yet
 * (per ADR-0019 the page is live on the OVH VPS but the production
 * monitors are still `active: false` — see infra/openstatus/openstatus.yaml).
 *
 * Verification of the live OpenStatus shape is tracked separately and
 * should happen the first time `status.afframe.com` returns real data
 * — see the AFF Linear issue filed alongside this commit.
 *
 * Public endpoint (no API key); the data it exposes is already public
 * via status.afframe.com.
 */

const STATUS_API_URL =
  process.env.STATUS_API_URL?.trim() ||
  "https://status.afframe.com/api/v1/status"
const STATUS_FETCH_TIMEOUT_MS = 2_000

interface OpenStatusComponentLite {
  name?: unknown
  status?: unknown
}

interface OpenStatusResponseLite {
  status?: unknown
  components?: unknown
}

const ALLOWED_STATUSES = new Set([
  "operational",
  "degraded_performance",
  "partial_outage",
  "major_outage",
])

function coerceStatus(value: unknown): StatusResponse["status"] {
  if (typeof value === "string" && ALLOWED_STATUSES.has(value)) {
    return value as StatusResponse["status"]
  }
  return "operational"
}

function coerceComponents(value: unknown): StatusResponse["components"] {
  if (!Array.isArray(value)) return []
  return value
    .filter(
      (c): c is OpenStatusComponentLite => typeof c === "object" && c !== null,
    )
    .map((c) => ({
      name: typeof c.name === "string" ? c.name : "Unknown",
      status: coerceStatus(c.status),
    }))
}

async function fetchOpenStatus(): Promise<StatusResponse | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), STATUS_FETCH_TIMEOUT_MS)
  try {
    const res = await fetch(STATUS_API_URL, { signal: controller.signal })
    if (!res.ok) return null
    const body = (await res.json()) as OpenStatusResponseLite
    return {
      status: coerceStatus(body.status),
      components: coerceComponents(body.components),
      statusPageUrl: "https://status.afframe.com",
      fetchedAt: new Date().toISOString(),
      source: "openstatus",
    }
  } catch {
    // Network error, timeout, or invalid JSON — fall back silently.
    return null
  } finally {
    clearTimeout(timer)
  }
}

function synthesizedFallback(): StatusResponse {
  return {
    status: "operational",
    components: [],
    statusPageUrl: "https://status.afframe.com",
    fetchedAt: new Date().toISOString(),
    source: "fallback",
  }
}

@ApiTags("Status")
@Controller({ path: "status", version: "1" })
export class StatusController {
  @Get()
  @ApiOperation({
    summary: "Service status",
    description:
      "Returns the service health summary. Proxies status.afframe.com " +
      "when reachable; synthesizes an operational fallback otherwise.",
  })
  @ApiOkResponse({ description: "Service status snapshot." })
  async getStatus(): Promise<StatusResponse> {
    return (await fetchOpenStatus()) ?? synthesizedFallback()
  }
}
