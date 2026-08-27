---
category: Fixed
---

Extended the beta employee-seat fence to Server Action modules — the `"use server"` POST endpoints under `[orgSlug]/**/_actions/` that the route walker skipped by construction — and closed two dodges in its API arm: only the literal `route.ts` was matched, and the walk started inside `orgs/[orgSlug]` instead of at `app/api`.
