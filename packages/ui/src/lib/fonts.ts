// Source of truth for font metadata. To change fonts:
// 1. Update family + variable here
// 2. Update the next/font import in apps/web/app/layout.tsx (must use literal strings)
export const fonts = {
  sans: { variable: "--font-sans", family: "Geist" },
  mono: { variable: "--font-mono", family: "Roobert Mono" },
  heading: { variable: "--font-heading", family: "Roobert" },
} as const

export type FontKey = keyof typeof fonts
