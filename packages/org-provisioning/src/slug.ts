/**
 * Slug + reserved-name policy — the single source of truth for turning an
 * organization's legal name into a URL slug, and for the names an org slug may
 * NOT take (they collide with an app route or would be confusing).
 *
 * Pure and dependency-free (a leaf module), so it is safe to import from the
 * web app (the `[orgSlug]` router guard and onboarding) AND from the backend
 * scaffolding orchestrator alike, with no risk of pulling in db/accounting.
 */

/** A slug must be at least this many characters (stricter than the DB's >= 2). */
export const MIN_SLUG_LENGTH = 3
/** ...and at most this many (internal to the slug pipeline). */
const MAX_SLUG_LENGTH = 48
/** Fallback base when a name yields nothing usable. Short, and NOT reserved. */
export const FALLBACK_SLUG = "org"

/**
 * Slugs an organization may not take. `[orgSlug]` is a top-level dynamic route,
 * so it is a sibling of every other top-level path (/workspace, /auth, /api,
 * /admin, /onboarding, Next internals). Those MUST be reserved for routing to
 * work; the rest are reserved so a company URL can't be confusing or land on a
 * brand / generic word. The `[orgSlug]/layout.tsx` router guard imports THIS set
 * (single source of truth) and redirects any reserved slug to /workspace.
 */
export const RESERVED_SLUGS: ReadonlySet<string> = new Set([
  // --- Routing / framework (top-level path collisions) ---
  "admin",
  "api",
  "app",
  "auth",
  "onboarding",
  "workspace",
  "_next",
  "favicon.ico",
  "robots.txt",
  "sitemap.xml",
  "manifest.json",
  ".well-known",
  "static",
  "public",
  "assets",
  "cdn",
  "www",
  // --- Product / auth surface ---
  "login",
  "logout",
  "signin",
  "signup",
  "register",
  "account",
  "settings",
  "profile",
  "dashboard",
  "home",
  "index",
  "billing",
  "search",
  "new",
  "create",
  "edit",
  "help",
  "support",
  "docs",
  "status",
  "about",
  "contact",
  "legal",
  "privacy",
  "terms",
  // --- Health / meta ---
  "health",
  "healthz",
  "version",
  "ping",
  "metrics",
  "debug",
  // --- Afframe brand ---
  "afframe",
  "sidekick",
  "brand",
  // --- Accounting domain (avoid confusing / ambiguous company URLs) ---
  "accounting",
  "records",
  "documents",
  "invoices",
  "invoice",
  "ledger",
  "journal",
  "saldokonto",
  "saldo",
  "vat",
  "dph",
  "tax",
  "taxes",
  "closing",
  "reports",
  "assets",
  "bank",
  "cash",
  "chart",
  "accounts",
  "period",
  "periods",
  "finance",
  // --- Generic / dangerous ---
  "organization",
  "organisation",
  "user",
  "users",
  "me",
  "system",
  "root",
  "null",
  "undefined",
  "none",
  "true",
  "false",
  "test",
  "demo",
  "example",
])

/** True when `slug` is reserved (cannot be an organization slug). */
export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug)
}

/**
 * Latin letters NFKD normalization does NOT decompose into base + diacritic, so
 * stripping combining marks alone leaves them; map them explicitly.
 */
const NON_DECOMPOSING: Record<string, string> = {
  ø: "o",
  ł: "l",
  đ: "d",
  ð: "d",
  þ: "th",
  ß: "ss",
  æ: "ae",
  œ: "oe",
}

/**
 * Trailing legal-form token sequences to cut, in the dashed form they take AFTER
 * word-splitting (e.g. "Acme, s.r.o." -> "acme-s-r-o" -> strip "-s-r-o" ->
 * "acme"). Checked longest/most-specific first; only ONE is stripped. This is
 * the single place that answers "where do we cut the legal form" — a known
 * trailing designator, never a mid-name token. Ambiguous initials (s.p., p.o.,
 * se) are deliberately NOT listed to avoid cutting real name words.
 */
const FORM_TOKEN_SUFFIXES: readonly string[] = [
  "-spol-s-r-o", // spol. s r.o.
  "-s-r-o", // s.r.o.
  "-v-o-s", // v.o.s.
  "-o-p-s", // o.p.s.
  "-nadacni-fond",
  "-a-s", // a.s.
  "-k-s", // k.s.
  "-z-s", // z.s.
  "-z-u", // z.ú.
  "-druzstvo",
  "-nadace",
]

/**
 * Turn a legal name into a URL slug. The pipeline, in order:
 *   1. transliterate diacritics (á->a, š->s, ř->r, ú->u, ...) via NFKD + a small
 *      map for the letters NFKD won't decompose;
 *   2. symbol words: "&" -> " a " (Czech "and"), "+" -> " plus ";
 *   3. lowercase everything and turn every run of non-alphanumerics into a
 *      single "-" (this is how words get dash-joined);
 *   4. cut ONE trailing legal-form designator (s.r.o. / a.s. / ...);
 *   5. trim, cap at MAX_SLUG_LENGTH, and fall back to FALLBACK_SLUG when the
 *      result is shorter than MIN_SLUG_LENGTH.
 *
 * Pure and deterministic; the uniqueness suffix (`-2`, `-3`) and the
 * reserved-slug skip live in the caller (pickUniqueSlug), not here.
 */
export function slugify(name: string): string {
  let s = name
    .normalize("NFKD") // á -> a + combining accent, š -> s + caron, ...
    .toLowerCase()
    .replace(/[øłđðþßæœ]/g, (c) => NON_DECOMPOSING[c] ?? c) // map before ASCII strip
    .replace(/[^\x00-\x7f]/g, "") // drop combining marks + any non-ASCII leftover
    .replace(/&/g, " a ") // ampersand -> Czech "a"
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "-") // word runs -> single dash
    .replace(/^-/, "")
    .replace(/-$/, "")

  // Cut one trailing legal-form designator (longest match first). The length
  // guard keeps a company literally named "s.r.o." from collapsing to nothing.
  for (const suffix of FORM_TOKEN_SUFFIXES) {
    if (s.endsWith(suffix) && s.length > suffix.length) {
      s = s.slice(0, -suffix.length)
      break
    }
  }

  s = s
    .replace(/-$/, "") // a strip/slice can leave a trailing dash
    .slice(0, MAX_SLUG_LENGTH)
    .replace(/-$/, "")

  return s.length < MIN_SLUG_LENGTH ? FALLBACK_SLUG : s
}
