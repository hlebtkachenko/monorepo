/**
 * Brand tokens — TypeScript mirror of the CSS variables defined in
 * `packages/ui/src/styles/globals.css`. Use these when a consumer can't
 * inherit the CSS cascade (server-rendered HTML outside Tailwind, plain
 * string templates, PDF generation, transactional emails).
 *
 * **Source of truth: `globals.css`.** Values here are duplicated only to
 * give non-CSS consumers (apps/api Scalar reference, packages/email,
 * packages/pdf) the same tokens without each one hardcoding hex literals.
 * `tokens.test.ts` parses globals.css and asserts the two stay in sync —
 * change one without the other and CI fails.
 *
 * Never hardcode brand color hex anywhere outside this module + globals.css.
 */

// Brand mono — neutral ink / paper. "Ink" = dark on light backgrounds; "paper" = white on dark.
export const BRAND_MONO_LIGHT = "#ffffff"
export const BRAND_MONO_DARK = "#0a1f1a"

// Brand primary — green logo / accents.
export const BRAND_PRIMARY_LIGHT = "#009473"
export const BRAND_PRIMARY_DARK = "#28dcb1"

// Brand admin — orange surface for the admin app.
export const BRAND_ADMIN_LIGHT = "#ec5011"
export const BRAND_ADMIN_DARK = "#ec5011"

// Component border-radius unit. Mirrors `--radius` in globals.css; consumers
// derive sm/md/lg/xl from this base the same way Tailwind does.
export const BRAND_RADIUS = "0.625rem"
