export interface ThemeTokens {
  background: string
  foreground: string
  card: string
  "card-foreground": string
  popover: string
  "popover-foreground": string
  primary: string
  "primary-foreground": string
  secondary: string
  "secondary-foreground": string
  muted: string
  "muted-foreground": string
  accent: string
  "accent-foreground": string
  destructive: string
  "destructive-foreground": string
  success: string
  "success-foreground": string
  warning: string
  "warning-foreground": string
  info: string
  "info-foreground": string
  purple: string
  "purple-foreground": string
  border: string
  input: string
  ring: string
  "chart-1": string
  "chart-2": string
  "chart-3": string
  "chart-4": string
  "chart-5": string
  sidebar: string
  "sidebar-foreground": string
  "sidebar-primary": string
  "sidebar-primary-foreground": string
  "sidebar-accent": string
  "sidebar-accent-foreground": string
  "sidebar-border": string
  "sidebar-ring": string
}

export interface ThemeDefinition {
  name: string
  cssClass: string
  light: ThemeTokens
  dark: ThemeTokens
}

export const COLOR_THEMES = [
  { name: "Default", value: "", cssClass: "" },
  { name: "Blue", value: "blue", cssClass: "theme-blue" },
  { name: "Green", value: "green", cssClass: "theme-green" },
] as const

export type ColorThemeValue = (typeof COLOR_THEMES)[number]["value"]
