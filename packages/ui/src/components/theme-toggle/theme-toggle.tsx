"use client"

import * as React from "react"
import { useTheme } from "next-themes"
import {
  Moon,
  Sun,
  Palette,
  CheckIcon,
  Minimize2,
  Maximize2,
} from "@workspace/ui/lib/icons"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { COLOR_THEMES } from "@workspace/ui/lib/theme"

function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme()
  const [colorTheme, setColorTheme] = React.useState("")
  const [isCompact, setIsCompact] = React.useState(false)

  React.useEffect(() => {
    const saved = localStorage.getItem("color-theme") ?? ""
    setColorTheme(saved)
    setIsCompact(localStorage.getItem("density") === "compact")
  }, [])

  function applyColorTheme(theme: string) {
    const html = document.documentElement
    for (const t of COLOR_THEMES) {
      if (t.cssClass) html.classList.remove(t.cssClass)
    }
    const match = COLOR_THEMES.find((t) => t.value === theme)
    if (match?.cssClass) html.classList.add(match.cssClass)
    localStorage.setItem("color-theme", theme)
    setColorTheme(theme)
  }

  function toggleDensity() {
    const next = !isCompact
    const html = document.documentElement
    if (next) {
      html.setAttribute("data-density", "compact")
      localStorage.setItem("density", "compact")
    } else {
      html.removeAttribute("data-density")
      localStorage.setItem("density", "")
    }
    setIsCompact(next)
  }

  return (
    <div className="flex items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon">
            <Palette className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {COLOR_THEMES.map((t) => (
            <DropdownMenuItem
              key={t.value}
              onClick={() => applyColorTheme(t.value)}
            >
              {t.name}
              {colorTheme === t.value && (
                <CheckIcon className="ml-auto size-4" />
              )}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Button variant="outline" size="icon" onClick={toggleDensity}>
        {isCompact ? (
          <Maximize2 className="size-4" />
        ) : (
          <Minimize2 className="size-4" />
        )}
      </Button>
      <Button
        variant="outline"
        size="icon"
        onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      >
        <Sun className="size-4 scale-100 rotate-0 transition-all dark:scale-0 dark:-rotate-90" />
        <Moon className="absolute size-4 scale-0 rotate-90 transition-all dark:scale-100 dark:rotate-0" />
      </Button>
    </div>
  )
}

export { ThemeToggle }
