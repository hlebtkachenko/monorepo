---
category: Added
bump: minor
---

Archetype bodies now type-govern which section kinds they may host: `ArchetypeTable` / `ArchetypeDetails` `sections` props (and `details-group` children) are narrowed via a single `ARCHETYPE_SECTION_POLICY` source of truth, so wiring a section into the wrong archetype body is a `tsc` error, with a dev-only runtime guard as a cast-bypass belt.
