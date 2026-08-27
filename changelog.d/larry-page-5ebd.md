---
category: Fixed
---

Tighten three of the beta boundary fences' directory skip-lists (s3-fence, scope-brand-fence, db-client-fence) to match by path instead of bare basename, so a future directory that happens to share a name with a skipped top-level one (migrations, fonts, public) can no longer be silently exempted from the AST scan.
