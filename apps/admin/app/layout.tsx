import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"
import localFont from "next/font/local"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"

import "@workspace/ui/globals.css"
import { getBrandText } from "@workspace/ui/brand-assets/server"
import { ThemeProvider } from "@workspace/ui/components/theme-provider"
import { Toaster } from "@workspace/ui/components/sonner"
import { BRAND_ICONS, BRAND_THEME_COLOR } from "@workspace/ui/lib/brand"
import { cn } from "@workspace/ui/lib/utils"

export const viewport: Viewport = {
  themeColor: BRAND_THEME_COLOR,
}

export async function generateMetadata(): Promise<Metadata> {
  const { name } = await getBrandText()
  const title = `${name} Admin`
  return {
    title: { default: title, template: `%s · ${title}` },
    description: "Design system tools",
    icons: BRAND_ICONS,
  }
}

const fontSans = Inter({ subsets: ["latin"], variable: "--font-sans" })

const fontHeading = localFont({
  variable: "--font-heading",
  src: [
    {
      path: "../fonts/roobert-proportional/Roobert-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-LightItalic.woff2",
      weight: "300",
      style: "italic",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-RegularItalic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-MediumItalic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-Heavy.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../fonts/roobert-proportional/Roobert-HeavyItalic.woff2",
      weight: "800",
      style: "italic",
    },
  ],
})

const fontMono = localFont({
  variable: "--font-mono",
  src: [
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-LightItalic.woff2",
      weight: "300",
      style: "italic",
    },
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
      path: "../fonts/roobert-semimono/RoobertSemiMono-MediumItalic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-Heavy.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../fonts/roobert-semimono/RoobertSemiMono-HeavyItalic.woff2",
      weight: "800",
      style: "italic",
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
          <ThemeProvider>{children}</ThemeProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
