import { z } from "zod"

import "./zod-openapi"

/**
 * `GET /v1/status` response — service health summary.
 *
 * The api proxies OpenStatus (`status.afframe.com`) when it's live and
 * synthesizes an "operational" response when the status page is down or
 * unreachable. The shape mirrors what OpenStatus exposes via its public
 * API so downstream consumers don't need to adapt when the proxy
 * actually wires in (AFF-XXX, blocked on status-page live deploy).
 */

export const ServiceStatusSchema = z
  .enum([
    "operational",
    "degraded_performance",
    "partial_outage",
    "major_outage",
  ])
  .openapi({
    description:
      "Overall service status. `operational` = all components healthy; " +
      "`degraded_performance` = one or more components reporting slow " +
      "responses; `partial_outage` = a non-critical component is down; " +
      "`major_outage` = a critical component is down.",
    example: "operational",
  })
export type ServiceStatus = z.infer<typeof ServiceStatusSchema>

export const ComponentStatusSchema = z
  .object({
    name: z.string().openapi({
      description: "Component label, e.g. `Public API`, `Web app`, `Database`.",
      example: "Public API",
    }),
    status: ServiceStatusSchema,
  })
  .openapi({
    description:
      "Per-component health entry. Mirrors the components shown on " +
      "status.afframe.com.",
  })
export type ComponentStatus = z.infer<typeof ComponentStatusSchema>

export const StatusResponseSchema = z
  .object({
    status: ServiceStatusSchema,
    components: z.array(ComponentStatusSchema).openapi({
      description:
        "Per-component health snapshots. Empty array when the status " +
        "page is offline and the api falls back to a synthesized response.",
    }),
    statusPageUrl: z.url().openapi({
      description:
        "Canonical status page URL. Always `https://status.afframe.com` — " +
        "included so SDK consumers can deep-link end users to the live page.",
      example: "https://status.afframe.com",
    }),
    fetchedAt: z.iso.datetime().openapi({
      description: "ISO-8601 timestamp of when this status was fetched.",
      example: "2026-05-21T18:00:00.000Z",
    }),
    source: z.enum(["openstatus", "fallback"]).openapi({
      description:
        "`openstatus` when the response came from the live status page; " +
        "`fallback` when status.afframe.com was unreachable and the api " +
        "synthesized an operational default.",
      example: "fallback",
    }),
  })
  .openapi({
    description:
      "Service status summary. Programmatic equivalent of " +
      "status.afframe.com — cache for 30s on the client side.",
  })
export type StatusResponse = z.infer<typeof StatusResponseSchema>
