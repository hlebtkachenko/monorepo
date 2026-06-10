/**
 * Non-localizable brand identifiers.
 *
 * Emails, URLs, phone numbers, social handles — values that are the same
 * across every locale. Edit one place, every consumer updates on next
 * build.
 *
 * Slots with the `<BRAND-...>` placeholder must be filled before a
 * production deploy. The guard at scripts/check-brand-placeholders.mjs
 * scans this module + the i18n message files and fails the deploy if any
 * placeholder remains under CHECK_BRAND_STRICT=true.
 */

// Emails
export const BRAND_SUPPORT_EMAIL = "support@afframe.com"
export const BRAND_SALES_EMAIL = "sales@afframe.com"
export const BRAND_BILLING_EMAIL = "billing@afframe.com"
// Legal / privacy / security inquiries route through support today.
export const BRAND_LEGAL_EMAIL = "support@afframe.com"
export const BRAND_PRIVACY_EMAIL = "support@afframe.com"
export const BRAND_SECURITY_EMAIL = "support@afframe.com"
export const BRAND_NOREPLY_EMAIL = "no-reply@afframe.com"

// Public-facing URLs
export const BRAND_MARKETING_URL = "https://afframe.com"
export const BRAND_APP_URL = "https://app.afframe.com"
export const BRAND_ADMIN_URL = "https://admin.afframe.com"
export const BRAND_API_URL = "https://api.afframe.com"
export const BRAND_STATUS_URL = "https://status.afframe.com"
export const BRAND_DOCS_URL = "https://docs.afframe.com"
export const BRAND_CHANGELOG_URL = "https://docs.afframe.com/changelog"
export const BRAND_BLOG_URL = "https://afframe.com/blog"
export const BRAND_PRIVACY_URL = "https://afframe.com/privacy"
export const BRAND_TERMS_URL = "https://afframe.com/terms"
// Cookies policy lives under privacy today; same page.
export const BRAND_COOKIES_URL = "https://afframe.com/privacy"

// Social — placeholders for now, gated by the prod-deploy placeholder check.
export const BRAND_LINKEDIN_URL = "<BRAND-LINKEDIN-URL>"
export const BRAND_FACEBOOK_URL = "<BRAND-FACEBOOK-URL>"
export const BRAND_INSTAGRAM_URL = "<BRAND-INSTAGRAM-URL>"
export const BRAND_THREADS_URL = "<BRAND-THREADS-URL>"
export const BRAND_YOUTUBE_URL = "<BRAND-YOUTUBE-URL>"

// Phone numbers (E.164 format expected when filled).
export const BRAND_PHONE_SUPPORT = "<BRAND-PHONE-SUPPORT>"
export const BRAND_PHONE_SALES = "<BRAND-PHONE-SALES>"

// Other
export const BRAND_FOUNDED_YEAR = 2025

/**
 * Placeholder partner names shown in the auth/onboarding aside marquee
 * until real partner brands are commissioned. Proper-noun strings — not
 * translatable, not branded. Swap to `{ src, alt }[]` SVG items when
 * real logos arrive (AuthAside.LogoMarquee already accepts that shape).
 */
export const PARTNER_PLACEHOLDER_NAMES = [
  "Northwind",
  "Helix",
  "Atrium",
  "Lumen",
  "Parallel",
  "Vantage",
  "Cobalt",
] as const
