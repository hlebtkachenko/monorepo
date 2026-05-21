/**
 * Shared types between extracted logo path modules and the Logo component.
 * Lives in brand-assets/ root so paths/*.ts can import "../logo-types".
 */

export type LogoVariant = "horizontal" | "stacked" | "logomark" | "wordmark"

/**
 * Explicit tones map 1:1 to a {mark, text} color pair. The 3 sugar tones
 * (`primary`, `admin`, `mono` without a `-light`/`-dark` suffix) render
 * both light + dark explicit variants and let CSS pick via the .dark
 * class on a parent.
 */
export type LogoToneExplicit =
  | "primary-light"
  | "primary-dark"
  | "admin-light"
  | "admin-dark"
  | "mono-light"
  | "mono-dark"

export type LogoToneSugar = "primary" | "admin" | "mono"

export type LogoTone = LogoToneExplicit | LogoToneSugar

export type LogoPathRole = "mark" | "text"

export interface LogoPath {
  d: string
  role: LogoPathRole
}

export interface LogoPathSet {
  viewBox: string
  paths: LogoPath[]
}
