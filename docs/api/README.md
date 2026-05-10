# API Specifications

Placeholder.

When backend APIs land, OpenAPI 3.1 specifications and Zod schemas live here:
- `*.openapi.yaml` — one file per service surface.
- `*.zod.ts` — Zod schemas, source of truth for runtime validation. OpenAPI generated from Zod via `zod-to-openapi`.

Currently no API exists. The only HTTP surface is `apps/web/app/api/version/route.ts`, which returns build metadata for the container healthcheck and has no contract worth versioning.

This directory is created early so the convention is set before the first API ships.
