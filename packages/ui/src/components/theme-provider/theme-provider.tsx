"use client"

import * as React from "react"
import { ThemeProvider as NextThemesProvider, useTheme } from "next-themes"
import { COLOR_THEMES } from "@workspace/ui/lib/theme"

function ThemeProvider({
  children,
  ...props
}: React.ComponentProps<typeof NextThemesProvider>) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      {...props}
    >
      <ColorThemeRestorer />
      <ThemeHotkey />
      {children}
    </NextThemesProvider>
  )
}

function ColorThemeRestorer() {
  React.useEffect(() => {
    const saved = localStorage.getItem("color-theme") ?? ""
    if (saved) {
      const match = COLOR_THEMES.find((t) => t.value === saved)
      if (match?.cssClass)
        document.documentElement.classList.add(match.cssClass)
    }
    const density = localStorage.getItem("density") ?? ""
    if (density) {
      document.documentElement.setAttribute("data-density", density)
    }
  }, [])
  return null
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.isContentEditable ||
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT"
  )
}

function ThemeHotkey() {
  const { resolvedTheme, setTheme } = useTheme()

  React.useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.defaultPrevented || event.repeat) {
        return
      }

      if (event.metaKey || event.ctrlKey || event.altKey) {
        return
      }

      // `event.key` is absent on some keydowns (autofill / IME composition),
      // so guard before lowercasing.
      if (event.key?.toLowerCase() !== "d") {
        return
      }

      if (isTypingTarget(event.target)) {
        return
      }

      setTheme(resolvedTheme === "dark" ? "light" : "dark")
    }

    window.addEventListener("keydown", onKeyDown)

    return () => {
      window.removeEventListener("keydown", onKeyDown)
    }
  }, [resolvedTheme, setTheme])

  return null
}

export { ThemeProvider, ThemeHotkey }
