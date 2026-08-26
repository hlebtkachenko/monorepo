import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"

import "@workspace/ui/globals.css"
import { getBrandText } from "@workspace/ui/brand-assets/server"
import { ThemeProvider } from "@workspace/ui/components/theme-provider"
import { Toaster } from "@workspace/ui/components/sonner"
import { IconProvider } from "@workspace/ui/icon-packs"
import { BRAND_THEME_COLOR } from "@workspace/ui/lib/brand"
import { cn } from "@workspace/ui/lib/utils"

import { getBetaTranslations } from "@/i18n/translations-server"

export const viewport: Viewport = {
  themeColor: BRAND_THEME_COLOR,
}

export async function generateMetadata(): Promise<Metadata> {
  const t = await getBetaTranslations()
  const brand = await getBrandText()
  const title = `${brand.name} ${t("app.badge")}`
  return {
    title: { default: title, template: `%s · ${title}` },
    description: t("app.title"),
    // The portal is authenticated and invite-only — never indexed. Paired with
    // the site-wide `X-Robots-Tag` header in next.config.mjs and app/robots.ts.
    robots: { index: false, follow: false },
  }
}

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontHeading = localFont({
  variable: "--font-heading",
  src: [
    {
      path: "../fonts/roobert-proportional/Roobert-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-Bold.woff2",
      weight: "700",
      style: "normal",
    },
  ],
})

const fontMono = localFont({
  variable: "--font-mono",
  src: [
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-RegularItalic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
  ],
})

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  const locale = await getLocale()
  const messages = await getMessages()
  return (
    <html
      lang={locale}
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased",
        fontSans.variable,
        fontMono.variable,
        fontHeading.variable,
      )}
    >
      <body>
        <NextIntlClientProvider messages={messages}>
          <ThemeProvider>
            <IconProvider>{children}</IconProvider>
          </ThemeProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
