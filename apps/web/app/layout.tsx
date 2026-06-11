import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages, getTranslations } from "next-intl/server"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@workspace/ui/components/theme-provider"
import { Toaster } from "@workspace/ui/components/sonner"
import { IconProvider } from "@workspace/ui/icon-packs"
import { BRAND_ICONS, BRAND_THEME_COLOR } from "@workspace/ui/lib/brand"
import { cn } from "@workspace/ui/lib/utils"

import { InstallNextLinkInUi } from "./_install-link"

export const viewport: Viewport = {
  themeColor: BRAND_THEME_COLOR,
}

export async function generateMetadata(): Promise<Metadata> {
  const tBrand = await getTranslations("brand")
  const brand = tBrand("name")
  return {
    title: { default: brand, template: `%s · ${brand}` },
    icons: BRAND_ICONS,
  }
}

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" })

// Trimmed face list (WP-03): only weights/styles actually used ship.
// Heading: 400/500/600/700 normal. Mono: 400/500/600 normal + 400
// italic (json-viewer renders `font-mono italic`). Unused faces
// (Light/Heavy, other italics) were removed — re-add the face here
// AND restore the .woff2 under fonts/ before using a new weight/style.
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          <InstallNextLinkInUi />
          <ThemeProvider>
            <IconProvider>{children}</IconProvider>
          </ThemeProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
