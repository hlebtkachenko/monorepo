# API Specifications

Placeholder.

When backend APIs land, OpenAPI 3.1 specifications and Zod schemas live here:
- `*.openapi.yaml` — one file per service surface.
- `*.zod.ts` — Zod schemas, source of truth for runtime validation. OpenAPI generated from Zod via `zod-to-openapi`.

`apps/api` (NestJS) is scaffolded but has no domain endpoints yet — only a health-check controller (`apps/api/src/health/health.controller.ts`) plus authz module wiring (Cerbos, OpenFGA). `apps/web` exposes `app/api/version/route.ts`, which returns build metadata for the container healthcheck. Neither has a contract worth versioning yet, so no spec files live here.

This directory is created early so the convention is set before the first API ships.
