---
category: Added
---

Added Debug "Archetype Table" reference pages in the new `/o/[orgSlug]` tree — a FULLY interactive Normal Table (views, favorite, auto-generated per-column filter, inline + inspector editing that saves back into the row, a working selection footer with Delete/Export, and a multi-tab row Inspector with Approve/Reject) and a real nested Pivot Table (two-level Category → Status row tree, Total + Count measures) — the first governed consumers of the section-library policy, wiring `ArchetypeTable` + the Table/Pivot Body + Inspector entirely from the packages/ui blocks. They read dedicated dev-seeded `demo_debug_*` tables (never real product data; empty in prod), so the pages double as clone-ready templates.
