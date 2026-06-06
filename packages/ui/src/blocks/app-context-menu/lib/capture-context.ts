/**
 * Browser-side context capture for the in-app right-click menu.
 *
 * Goal: collect as much *useful* context as possible without blowing
 * past clipboard sanity (≈10 KB) or leaking private data the user
 * didn't intend to share. Everything is computed at right-click time —
 * no observers, no telemetry, no persistent state.
 */

/* ── caps ──────────────────────────────────────────────────────────── */
const SELECTION_TEXT_CAP = 2000
const SELECTION_HTML_CAP = 2000
const ELEMENT_TEXT_CAP = 500
const NEARBY_TEXT_CAP = 800
const CLASSES_CAP = 300
const DOM_DEPTH = 10
const HEADING_LOOKBACK = 4

const PAYLOAD_VERSION = 1

/* ── domain types ──────────────────────────────────────────────────── */

export type PayloadKind =
  | "sidekick.ask"
  | "agent.copy_path"
  | "docs.search"
  | "bug.report"

export interface ElementInfo {
  tag: string
  data_slot: string | null
  role: string | null
  id: string | null
  classes: string | null
  text: string
  dom_path: string
  bounding_rect: DOMRectLite | null
}

export interface SelectionInfo {
  text: string | null
  html: string | null
  rect: DOMRectLite | null
}

export interface PageInfo {
  url: string
  pathname: string
  title: string | null
  locale: string | null
  theme: "light" | "dark" | "system" | null
  referrer: string | null
}

export interface SurroundingInfo {
  nearest_heading: string | null
  inferred_block: string | null
  nearby_text: string
}

export interface ClientInfo {
  user_agent: string
  platform: string | null
  language: string | null
  timezone: string | null
  online: boolean
  prefers_dark: boolean
}

export interface ViewportInfo {
  width: number
  height: number
  scroll_y: number
  device_pixel_ratio: number
}

export interface ScopeInfo {
  org_slug?: string
  user?: { id?: string; email?: string }
}

export interface DOMRectLite {
  top: number
  left: number
  width: number
  height: number
}

export interface CapturedContext {
  version: number
  timestamp: string
  page: PageInfo
  scope: ScopeInfo
  element: ElementInfo
  selection: SelectionInfo
  surrounding: SurroundingInfo
  viewport: ViewportInfo
  client: ClientInfo
}

/* ── capture entry ─────────────────────────────────────────────────── */

interface CaptureInput {
  target: HTMLElement | null
  selectionText: string | null
  pathname: string
  user?: { id?: string; email?: string }
  orgSlug?: string
}

export function captureContext(input: CaptureInput): CapturedContext {
  const { target, selectionText, pathname, user, orgSlug } = input
  return {
    version: PAYLOAD_VERSION,
    timestamp: new Date().toISOString(),
    page: capturePage(pathname),
    scope: {
      ...(orgSlug ? { org_slug: orgSlug } : {}),
      ...(user ? { user } : {}),
    },
    element: captureElement(target),
    selection: captureSelection(selectionText),
    surrounding: captureSurrounding(target),
    viewport: captureViewport(),
    client: captureClient(),
  }
}

/* ── capture helpers ───────────────────────────────────────────────── */

/**
 * Reduce a URL to origin + pathname, dropping the query string and hash.
 * Captured page/referrer URLs are forwarded to the support inbox + Linear,
 * so query params (invite/reset tokens, signed-download params, search
 * terms) must never leave the browser. Do NOT restore the full href.
 */
function originPath(href: string): string {
  try {
    const u = new URL(href)
    return u.origin + u.pathname
  } catch {
    return href.split(/[?#]/)[0] ?? href
  }
}

function capturePage(pathname: string): PageInfo {
  if (typeof window === "undefined") {
    return {
      url: pathname,
      pathname,
      title: null,
      locale: null,
      theme: null,
      referrer: null,
    }
  }
  const root = document.documentElement
  const theme: PageInfo["theme"] = root.classList.contains("dark")
    ? "dark"
    : root.classList.contains("light")
      ? "light"
      : "system"
  return {
    url: originPath(window.location.href),
    pathname,
    title: document.title || null,
    locale: root.lang || null,
    theme,
    referrer: document.referrer ? originPath(document.referrer) : null,
  }
}

function captureElement(target: HTMLElement | null): ElementInfo {
  if (!target) return emptyElement()
  const rect = safeRect(target)
  return {
    tag: target.tagName.toLowerCase(),
    data_slot: target.dataset.slot ?? null,
    role: target.getAttribute("role"),
    id: target.id || null,
    classes: target.className
      ? String(target.className).slice(0, CLASSES_CAP)
      : null,
    text: (target.textContent ?? "").trim().slice(0, ELEMENT_TEXT_CAP),
    dom_path: buildDomPath(target),
    bounding_rect: rect,
  }
}

function captureSelection(text: string | null): SelectionInfo {
  if (typeof window === "undefined" || !text) {
    return { text: null, html: null, rect: null }
  }
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) {
    return { text: text.slice(0, SELECTION_TEXT_CAP), html: null, rect: null }
  }
  const range = sel.getRangeAt(0)
  let html: string | null
  try {
    const container = document.createElement("div")
    container.appendChild(range.cloneContents())
    html = container.innerHTML.slice(0, SELECTION_HTML_CAP)
  } catch {
    html = null
  }
  const rect = safeDomRect(range.getBoundingClientRect())
  return {
    text: text.slice(0, SELECTION_TEXT_CAP),
    html,
    rect,
  }
}

function captureSurrounding(target: HTMLElement | null): SurroundingInfo {
  if (!target) {
    return { nearest_heading: null, inferred_block: null, nearby_text: "" }
  }
  return {
    nearest_heading: findNearestHeading(target),
    inferred_block: findInferredBlock(target),
    nearby_text: collectNearbyText(target),
  }
}

function captureViewport(): ViewportInfo {
  if (typeof window === "undefined") {
    return { width: 0, height: 0, scroll_y: 0, device_pixel_ratio: 1 }
  }
  return {
    width: window.innerWidth,
    height: window.innerHeight,
    scroll_y: Math.round(window.scrollY),
    device_pixel_ratio: window.devicePixelRatio || 1,
  }
}

function captureClient(): ClientInfo {
  if (typeof navigator === "undefined") {
    return {
      user_agent: "unknown",
      platform: null,
      language: null,
      timezone: null,
      online: false,
      prefers_dark: false,
    }
  }
  let timezone: string | null
  try {
    timezone = Intl.DateTimeFormat().resolvedOptions().timeZone ?? null
  } catch {
    timezone = null
  }
  return {
    user_agent: navigator.userAgent,
    platform:
      ("userAgentData" in navigator &&
        (navigator as unknown as { userAgentData?: { platform?: string } })
          .userAgentData?.platform) ||
      navigator.platform ||
      null,
    language: navigator.language || null,
    timezone,
    online: navigator.onLine,
    prefers_dark:
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-color-scheme: dark)").matches === true,
  }
}

/* ── DOM utilities ─────────────────────────────────────────────────── */

function buildDomPath(el: HTMLElement | null): string {
  if (!el) return ""
  const parts: string[] = []
  let node: HTMLElement | null = el
  for (let i = 0; node && i < DOM_DEPTH; i += 1) {
    let part = node.tagName.toLowerCase()
    if (node.dataset.slot) part += `[data-slot="${node.dataset.slot}"]`
    else if (node.id) part += `#${node.id}`
    parts.unshift(part)
    node = node.parentElement
  }
  return parts.join(" > ")
}

function findNearestHeading(el: HTMLElement): string | null {
  let node: HTMLElement | null = el
  for (let i = 0; node && i < HEADING_LOOKBACK; i += 1) {
    // Walk previous siblings at this level, nearest first, and take the
    // closest one that is (or contains) a heading. Only after exhausting
    // this level do we ascend — so we return the nearest *preceding*
    // heading rather than the first heading anywhere in the parent subtree.
    let sibling: Element | null = node.previousElementSibling
    while (sibling) {
      const heading = sibling.matches("h1, h2, h3, h4")
        ? sibling
        : sibling.querySelector("h1, h2, h3, h4")
      if (heading?.textContent) {
        return heading.textContent.trim().slice(0, 200)
      }
      sibling = sibling.previousElementSibling
    }
    node = node.parentElement
  }
  return null
}

function findInferredBlock(el: HTMLElement): string | null {
  let node: HTMLElement | null = el
  for (let i = 0; node && i < DOM_DEPTH; i += 1) {
    if (node.dataset.slot) return node.dataset.slot
    node = node.parentElement
  }
  return null
}

function collectNearbyText(el: HTMLElement): string {
  // Walk up to the nearest "block-like" ancestor (data-slot or section,
  // article, main, form) and grab its textContent.
  let node: HTMLElement | null = el
  for (let i = 0; node && i < DOM_DEPTH; i += 1) {
    const tag = node.tagName.toLowerCase()
    if (
      node.dataset.slot ||
      tag === "section" ||
      tag === "article" ||
      tag === "main" ||
      tag === "form" ||
      tag === "dialog"
    ) {
      return (node.textContent ?? "").trim().slice(0, NEARBY_TEXT_CAP)
    }
    node = node.parentElement
  }
  return (el.parentElement?.textContent ?? "").trim().slice(0, NEARBY_TEXT_CAP)
}

function safeRect(target: HTMLElement | null): DOMRectLite | null {
  if (!target) return null
  try {
    return safeDomRect(target.getBoundingClientRect())
  } catch {
    return null
  }
}

function safeDomRect(rect: DOMRect): DOMRectLite {
  return {
    top: Math.round(rect.top),
    left: Math.round(rect.left),
    width: Math.round(rect.width),
    height: Math.round(rect.height),
  }
}

function emptyElement(): ElementInfo {
  return {
    tag: "",
    data_slot: null,
    role: null,
    id: null,
    classes: null,
    text: "",
    dom_path: "",
    bounding_rect: null,
  }
}

/* ── file inference ────────────────────────────────────────────────── */

/**
 * Maps a URL pathname to its most likely Next.js page file. Default
 * base path is `apps/web/app` (the apps/web router). Other apps should
 * pass `appConfig.pageFileResolver` with their own resolver.
 *
 * Use the returned string as an agent hint, not a guaranteed truth
 * (route groups like `(default)` aren't always inferable from URLs
 * alone).
 */
export function guessPageFile(
  pathname: string,
  appBasePath = "apps/web/app",
): string {
  if (pathname.startsWith("/auth/")) {
    return `${appBasePath}/auth/(default)${pathname.slice(5)}/page.tsx`
  }
  if (pathname.startsWith("/workspace")) {
    return `${appBasePath}${pathname || "/workspace"}/page.tsx`
  }
  if (pathname.startsWith("/onboarding")) {
    return `${appBasePath}${pathname}/page.tsx`
  }
  if (pathname.startsWith("/api/")) {
    return `${appBasePath}${pathname}/route.ts`
  }
  const parts = pathname.split("/").filter(Boolean)
  if (parts.length === 0) return `${appBasePath}/page.tsx`
  if (parts.length === 1) return `${appBasePath}/[orgSlug]/page.tsx`
  return `${appBasePath}/[orgSlug]/${parts.slice(1).join("/")}/page.tsx`
}

/* ── app config (consumer-supplied) ────────────────────────────────── */

/**
 * Consumer-supplied identity used by the clipboard formatters. Every
 * field is optional — defaults produce generic copy ("the app", repo:
 * null, etc) so the block can be dropped into any app without leaking
 * Afframe-specific strings or developer-machine paths.
 */
export interface AppConfig {
  /** App brand name, used in payload preambles. Defaults to "the app". */
  appName?: string
  /** Display name of the repo for "Copy path" payload. */
  repoName?: string
  /**
   * Absolute working directory of the repo for "Copy path" payload —
   * agent uses this to know where to run `cd`. Omit if unknown; the
   * agent will ask. Never hardcode a developer's machine path.
   */
  workingDirectory?: string
  /** Framework label for "Copy path" payload (e.g. "Next.js + Turborepo"). */
  framework?: string
  /** Override for the page-file inference used in "Copy path" payload. */
  pageFileResolver?: (pathname: string) => string
}

const DEFAULT_CONFIG: Required<
  Omit<AppConfig, "workingDirectory" | "framework" | "pageFileResolver">
> & {
  workingDirectory: string | null
  framework: string | null
  pageFileResolver: (pathname: string) => string
} = {
  appName: "the app",
  repoName: "this repo",
  workingDirectory: null,
  framework: null,
  pageFileResolver: guessPageFile,
}

function resolveConfig(config: AppConfig | undefined): typeof DEFAULT_CONFIG {
  return {
    appName: config?.appName ?? DEFAULT_CONFIG.appName,
    repoName: config?.repoName ?? DEFAULT_CONFIG.repoName,
    workingDirectory:
      config?.workingDirectory ?? DEFAULT_CONFIG.workingDirectory,
    framework: config?.framework ?? DEFAULT_CONFIG.framework,
    pageFileResolver:
      config?.pageFileResolver ?? DEFAULT_CONFIG.pageFileResolver,
  }
}

/* ── payload formatters ────────────────────────────────────────────── */

type SidekickPayload = CapturedContext & {
  kind: "sidekick.ask"
  user_question: string
}

type AgentPayload = CapturedContext & {
  kind: "agent.copy_path"
  repo: {
    name: string | null
    branch: string | null
    working_directory: string | null
    framework: string | null
  }
  likely_file: string
  task: string
}

type DocsSearchPayload = CapturedContext & {
  kind: "docs.search"
  query: string
}

/**
 * Matches the public `Send feedback` API enum exactly:
 *   bug      — something broken
 *   request  — new feature ask
 *   issue    — process / UX / docs problem
 *   question — support question that didn't fit the FAQ
 */
export type BugReportType = "bug" | "request" | "issue" | "question"

export const BUG_REPORT_TYPES: ReadonlyArray<{
  value: BugReportType
  label: string
}> = [
  { value: "bug", label: "Bug" },
  { value: "request", label: "Feature request" },
  { value: "issue", label: "Process / UX issue" },
  // Wire value stays "question" (the public /v1/feedback enum); only the
  // user-facing label is "Feedback".
  { value: "question", label: "Feedback" },
]

export interface BugReportPayload extends CapturedContext {
  kind: "bug.report"
  /** Aligned with public API enum (bug | request | issue | question). */
  type: BugReportType
  /** Aligned with public API field; 1–4000 chars. */
  message: string
  /** Optional reply-to email; pre-filled from session, user editable. */
  email: string | null
  /** Auto-generated title for the Linear issue. */
  auto_title: string
}

/**
 * Builds the "Ask Sidekick" clipboard payload — human prefix followed
 * by a fenced JSON block so the AI assistant (Claude, Cursor, etc) can
 * both read the framing and parse the structured context.
 */
export function formatAskSidekick(
  ctx: CapturedContext,
  config?: AppConfig,
): string {
  const { appName } = resolveConfig(config)
  const payload: SidekickPayload = {
    ...ctx,
    kind: "sidekick.ask",
    user_question: "",
  }
  return [
    `You are Sidekick, the in-app assistant for ${appName}.`,
    "The user right-clicked on a specific element and copied this context to ask you a question.",
    "Use the JSON below as ground truth for what they were looking at.",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "Question (fill this in before sending):",
    "",
  ].join("\n")
}

/**
 * Builds the "About this block" clipboard payload — auto-derived
 * search query plus full context. Future: this will trigger an in-app
 * help center deep-link in a new window; for now it lands on the
 * clipboard ready to paste into any docs search.
 */
export function formatAboutBlock(
  ctx: CapturedContext,
  _config?: AppConfig,
): string {
  const query = inferDocsQuery(ctx)
  const payload: DocsSearchPayload = {
    ...ctx,
    kind: "docs.search",
    query,
  }
  return [
    "Looking for documentation about this block.",
    "",
    `Search query: ${query}`,
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
  ].join("\n")
}

/**
 * Builds the "Copy path" clipboard payload — designed to be pasted to
 * a coding agent (Claude Code, Cursor, etc) so it knows exactly what
 * the user was looking at and can act in the repo immediately.
 */
export function formatCopyPath(
  ctx: CapturedContext,
  config?: AppConfig,
): string {
  const { repoName, workingDirectory, framework, pageFileResolver } =
    resolveConfig(config)
  const payload: AgentPayload = {
    ...ctx,
    kind: "agent.copy_path",
    repo: {
      name: repoName,
      branch: null,
      working_directory: workingDirectory,
      framework,
    },
    likely_file: pageFileResolver(ctx.page.pathname),
    task: "",
  }
  return [
    `You are a coding agent working in the ${repoName} repo.`,
    "The user right-clicked on a specific UI element and copied this context.",
    "Their task description is empty — ask the user what they want before editing files.",
    "",
    "```json",
    JSON.stringify(payload, null, 2),
    "```",
    "",
    "Task (fill in what you want done):",
    "",
  ].join("\n")
}

/**
 * Builds the bug-report payload sent to `/api/feedback/bug`. Contains
 * the full captured context plus the dialog inputs. Field names mirror
 * the public `Send feedback` API contract (`type`, `message`, `email`)
 * so a future swap to that endpoint is a URL change, not a refactor.
 */
export function buildBugReport(input: {
  ctx: CapturedContext
  type: BugReportType
  message: string
  email?: string | null
}): BugReportPayload {
  return {
    ...input.ctx,
    kind: "bug.report",
    type: input.type,
    auto_title: autoBugTitle(input.ctx, input.type),
    message: input.message,
    email: input.email?.trim() ? input.email.trim() : null,
  }
}

/* ── inference helpers ─────────────────────────────────────────────── */

function inferDocsQuery(ctx: CapturedContext): string {
  // Prefer the inferred block (data-slot of nearest ancestor),
  // fall back to the element's own data-slot, then role, then tag.
  // `||` not `??`: an empty captured element yields tag === "" (not null),
  // which must fall through to the "app" default rather than short-circuit.
  return (
    ctx.surrounding.inferred_block ||
    ctx.element.data_slot ||
    ctx.element.role ||
    ctx.element.tag ||
    "app"
  )
}

function autoBugTitle(ctx: CapturedContext, type: BugReportType): string {
  const where = ctx.page.pathname || "/"
  const what =
    ctx.surrounding.inferred_block ||
    ctx.element.data_slot ||
    ctx.element.role ||
    ctx.element.tag ||
    "page"
  const prefix =
    type === "request"
      ? "[request]"
      : type === "issue"
        ? "[issue]"
        : type === "question"
          ? "[question]"
          : "[bug]"
  return `${prefix} ${where} — ${what}`
}
