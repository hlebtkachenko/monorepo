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
export const BRAND_SUPPORT_EMAIL = "<BRAND-SUPPORT-EMAIL>"
export const BRAND_SALES_EMAIL = "<BRAND-SALES-EMAIL>"
export const BRAND_BILLING_EMAIL = "<BRAND-BILLING-EMAIL>"
export const BRAND_LEGAL_EMAIL = "<BRAND-LEGAL-EMAIL>"
export const BRAND_PRIVACY_EMAIL = "<BRAND-PRIVACY-EMAIL>"
export const BRAND_SECURITY_EMAIL = "<BRAND-SECURITY-EMAIL>"
export const BRAND_NOREPLY_EMAIL = "no-reply@afframe.com"

// Public-facing URLs
export const BRAND_MARKETING_URL = "https://afframe.com"
export const BRAND_APP_URL = "https://app.afframe.com"
export const BRAND_ADMIN_URL = "https://admin.afframe.com"
export const BRAND_API_URL = "https://api.afframe.com"
export const BRAND_STATUS_URL = "https://status.afframe.com"
export const BRAND_DOCS_URL = "<BRAND-DOCS-URL>"
export const BRAND_CHANGELOG_URL = "<BRAND-CHANGELOG-URL>"
export const BRAND_BLOG_URL = "<BRAND-BLOG-URL>"
export const BRAND_PRIVACY_URL = "<BRAND-PRIVACY-URL>"
export const BRAND_TERMS_URL = "<BRAND-TERMS-URL>"
export const BRAND_COOKIES_URL = "<BRAND-COOKIES-URL>"
export const BRAND_DPA_URL = "<BRAND-DPA-URL>"
export const BRAND_SECURITY_URL = "<BRAND-SECURITY-URL>"

// Social
export const BRAND_GITHUB_URL = "https://github.com/hlebtkachenko/monorepo"
export const BRAND_LINKEDIN_URL = "<BRAND-LINKEDIN-URL>"
export const BRAND_TWITTER_URL = "<BRAND-TWITTER-URL>"
export const BRAND_YOUTUBE_URL = "<BRAND-YOUTUBE-URL>"

// Phone numbers (E.164 format expected when filled)
export const BRAND_PHONE_SUPPORT = "<BRAND-PHONE-SUPPORT>"
export const BRAND_PHONE_SALES = "<BRAND-PHONE-SALES>"

// Other
export const BRAND_FOUNDED_YEAR = 2025
