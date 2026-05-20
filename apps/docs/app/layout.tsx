import type { Metadata } from "next"
import { Geist } from "next/font/google"

import "@workspace/ui/globals.css"
import { ThemeProvider } from "@workspace/ui/components/theme-provider"
import { cn } from "@workspace/ui/lib/utils"

import { CmdK } from "@/components/cmd-k"
import { TopNav } from "@/components/top-nav"

const fontSans = Geist({ subsets: ["latin"], variable: "--font-sans" })

export const metadata: Metadata = {
  metadataBase: new URL("https://docs.afframe.com"),
  title: {
    default: "Afframe Developer Hub",
    template: "%s · Afframe Developer Hub",
  },
  description:
    "Build accounting integrations on Afframe. REST API, SDK, MCP server, " +
    "Czech-specific domain primitives.",
  openGraph: {
    type: "website",
    url: "https://docs.afframe.com",
    siteName: "Afframe Developer Hub",
  },
  twitter: { card: "summary_large_image" },
}

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={cn(
          "min-h-screen bg-background font-sans text-foreground antialiased",
          fontSans.variable,
        )}
      >
        <ThemeProvider>
          <TopNav />
          <main className="mx-auto w-full max-w-7xl px-6 py-10">
            {children}
          </main>
          <CmdK />
        </ThemeProvider>
      </body>
    </html>
  )
}
