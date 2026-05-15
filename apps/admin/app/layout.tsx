import type { Metadata } from "next"
import { Geist } from "next/font/google"
import localFont from "next/font/local"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@workspace/ui/components/theme-provider"
import { Toaster } from "@workspace/ui/components/sonner"
import { cn } from "@workspace/ui/lib/utils"

export const metadata: Metadata = {
  title: "Admin",
  description: "Design system tools",
}

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

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={cn(
        "font-sans antialiased",
        fontSans.variable,
        fontMono.variable,
        fontHeading.variable,
      )}
    >
      <body>
        <ThemeProvider>{children}</ThemeProvider>
        <Toaster />
      </body>
    </html>
  )
}
