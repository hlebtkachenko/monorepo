---
category: Added
bump: minor
---

Beta: obrat (annual turnover) now has a feeder — migration 0020 adds the `organization_indicator` table, the office agent publishes readings through `POST /api/agent/v1/orgs/{slug}/indicators`, and Přehled's Obrat watch reads the newest one instead of always rendering an absence.
