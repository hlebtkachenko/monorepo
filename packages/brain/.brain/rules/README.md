# `.brain/rules/` — learned booking rules (předkontace)

Machine-readable classification/posting rules the Brain consults. **Parse/classify-side only** (I9) —
never write templates. Populated by the librarian via GitHub PR + the `brain-eval.yml` gate (booking
≥ 0.90 on the suite). Empty at M0. Risky-class rules (VAT regime / RC / 500-2002 chart / judge rubric)
stay human-gated forever.

**M2.2 (`../../src/librarian/`)** builds the propose-only engine that distills a candidate rule from
clustered corrections — see `../../src/librarian/README.md` for the pipeline + the reviewable-artifact
format. This directory itself gains no files from that engine directly: a candidate only lands here
as a real `*.md` rule through the normal human-reviewed GitHub PR flow this README already describes
(ADR-0027). Still empty as of M2.2 — the engine ships fixture-tested; it has not yet run against a
real correction.
