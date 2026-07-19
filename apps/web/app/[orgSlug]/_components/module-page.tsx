/**
 * Shim — the canonical `ModulePage` now lives in the cross-tier-shared
 * `apps/web/app/_components/module-page.tsx`. Kept here so the in-tree pages
 * that import it relatively need no edit; this subtree is deleted at the
 * org-rebuild flip.
 */
export { ModulePage } from "../../_components/module-page"
