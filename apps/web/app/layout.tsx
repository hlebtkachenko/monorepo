import { Geist } from "next/font/google"
import localFont from "next/font/local"
import { NextIntlClientProvider } from "next-intl"
import { getLocale, getMessages } from "next-intl/server"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@workspace/ui/components/theme-provider"
import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })

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
      path: "../fonts/roobert-mono/RoobertMono-Light.woff2",
      weight: "300",
      style: "normal",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-LightItalic.woff2",
      weight: "300",
      style: "italic",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-Regular.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-RegularItalic.woff2",
      weight: "400",
      style: "italic",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-Medium.woff2",
      weight: "500",
      style: "normal",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-MediumItalic.woff2",
      weight: "500",
      style: "italic",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-SemiBold.woff2",
      weight: "600",
      style: "normal",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-SemiBoldItalic.woff2",
      weight: "600",
      style: "italic",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-Bold.woff2",
      weight: "700",
      style: "normal",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-BoldItalic.woff2",
      weight: "700",
      style: "italic",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-Heavy.woff2",
      weight: "800",
      style: "normal",
    },
    {
      path: "../fonts/roobert-mono/RoobertMono-HeavyItalic.woff2",
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
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider>{children}</ThemeProvider>
          <Toaster />
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
