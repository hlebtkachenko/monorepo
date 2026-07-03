"use client"

import {
  Fragment,
  type ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  ArrowUpDown,
  CornerDownLeft,
  Hash,
  Search,
  Sparkles,
} from "lucide-react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@workspace/ui/components/command"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import { Separator } from "@workspace/ui/components/separator"

import { searchAllAction } from "@/lib/admin-search"
import type { SearchResult } from "@/lib/admin-search-types"

import {
  ADMIN_COMMANDS,
  type AdminCommand,
  type CommandRunContext,
  type CommandShortcut,
  type SubcommandConfig,
  type SubcommandPrompt,
} from "./cmdk-commands"
import {
  getStickyScope,
  pushRecent,
  readRecents,
  setStickyScope,
  type CmdkRecent,
  type StickyScope,
} from "./cmdk-storage"
import { ROUTE_REGISTRY, type RouteEntry } from "./route-registry.generated"

type Scope = StickyScope

const SCOPES: Array<{ key: Scope; label: string }> = [
  { key: "all", label: "All" },
  { key: "commands", label: "Commands" },
  { key: "pages", label: "Pages" },
  { key: "live", label: "Live" },
]

const SIGIL_TO_SCOPE: Record<string, Scope | "ai"> = {
  ">": "commands",
  "@": "live",
  "#": "live",
  "/": "pages",
  "?": "ai",
}

interface ParsedSigil {
  sigil: string | null
  scope: Scope | null
  /** When the sigil locks Live to a specific kind. */
  liveKind: SearchResult["kind"] | null
  /** Whether the AI placeholder row should render. */
  ai: boolean
  /** Query stripped of the leading sigil + optional space. */
  effectiveQuery: string
}

function parseSigil(input: string): ParsedSigil {
  if (input.length === 0) {
    return {
      sigil: null,
      scope: null,
      liveKind: null,
      ai: false,
      effectiveQuery: "",
    }
  }
  const first = input[0]
  const mapped = first ? SIGIL_TO_SCOPE[first] : undefined
  if (!first || mapped === undefined) {
    return {
      sigil: null,
      scope: null,
      liveKind: null,
      ai: false,
      effectiveQuery: input,
    }
  }
  const rest = input.slice(1).replace(/^\s+/, "")
  if (mapped === "ai") {
    return {
      sigil: first,
      scope: null,
      liveKind: null,
      ai: true,
      effectiveQuery: rest,
    }
  }
  const liveKind: SearchResult["kind"] | null =
    first === "@" ? "user" : first === "#" ? "org" : null
  return {
    sigil: first,
    scope: mapped,
    liveKind,
    ai: false,
    effectiveQuery: rest,
  }
}

function scoreCommand(query: string, c: AdminCommand): number {
  const tokens = tokenize(query)
  if (tokens.length === 0) return 1
  const haystack = (
    c.label +
    " " +
    c.group +
    " " +
    (c.keywords ?? "")
  ).toLowerCase()
  const label = c.label.toLowerCase()
  let score = 0
  for (const t of tokens) {
    if (!haystack.includes(t)) return 0
    if (label === t) score += 200
    if (label.startsWith(t)) score += 100
    if (label.includes(t)) score += 50
    if ((c.keywords ?? "").toLowerCase().includes(t)) score += 25
  }
  return score
}

const KIND_VARIANT: Record<
  SearchResult["kind"],
  "default" | "secondary" | "destructive" | "outline" | "ghost" | "link"
> = {
  org: "default",
  user: "secondary",
  workspace: "outline",
  audit: "destructive",
  tool: "ghost",
}

function tokenize(q: string): string[] {
  return q
    .toLowerCase()
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0)
}

function scorePage(query: string, page: RouteEntry): number {
  const tokens = tokenize(query)
  if (tokens.length === 0) return 0
  const haystack = (
    page.label +
    " " +
    page.section +
    " " +
    page.href +
    " " +
    page.keywords
  ).toLowerCase()
  const label = page.label.toLowerCase()
  let score = 0
  for (const t of tokens) {
    if (!haystack.includes(t)) return 0
    if (label === t) score += 200
    if (label.startsWith(t)) score += 100
    if (label.includes(t)) score += 50
    if (page.href.toLowerCase().includes(t)) score += 25
    if (page.keywords.toLowerCase().includes(t)) score += 10
  }
  return score
}

function shortcutMatches(shortcut: CommandShortcut, e: KeyboardEvent): boolean {
  const needMeta = shortcut.mods.includes("meta")
  const needShift = shortcut.mods.includes("shift")
  const needAlt = shortcut.mods.includes("alt")
  const metaPressed = e.metaKey || e.ctrlKey
  if (needMeta !== metaPressed) return false
  if (needShift !== e.shiftKey) return false
  if (needAlt !== e.altKey) return false
  return e.key.toLowerCase() === shortcut.key.toLowerCase()
}

function renderShortcut(shortcut: CommandShortcut): ReactElement {
  return (
    <KbdGroup className="ml-auto">
      {shortcut.mods.includes("meta") ? <Kbd>⌘</Kbd> : null}
      {shortcut.mods.includes("shift") ? <Kbd>⇧</Kbd> : null}
      {shortcut.mods.includes("alt") ? <Kbd>⌥</Kbd> : null}
      <Kbd>{shortcut.key.toUpperCase()}</Kbd>
    </KbdGroup>
  )
}

interface ModeRoot {
  kind: "root"
}
interface ModeSubcommand {
  kind: "subcommand"
  cmd: AdminCommand
  step: number
  data: Record<string, unknown>
}
type Mode = ModeRoot | ModeSubcommand

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  return false
}

interface CommandPaletteProps {
  userId: string
}

export function CommandPalette({ userId }: CommandPaletteProps) {
  const router = useRouter()
  const { setTheme, theme } = useTheme()
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [scope, setScope] = useState<Scope>("all")
  const [scopeHydrated, setScopeHydrated] = useState(false)
  const [results, setResults] = useState<SearchResult[]>([])
  const [recents, setRecents] = useState<CmdkRecent[]>([])
  const [mode, setMode] = useState<Mode>({ kind: "root" })
  const [pickItems, setPickItems] = useState<
    Array<{ id: string; label: string; sublabel?: string }>
  >([])
  const debounceRef = useRef<number | null>(null)
  const themeRef = useRef<string | undefined>(theme)
  themeRef.current = theme

  // Hydrate sticky scope per userId on mount.
  useEffect(() => {
    setScope(getStickyScope(userId))
    setScopeHydrated(true)
  }, [userId])

  // Persist scope on user change (skip the initial hydration).
  useEffect(() => {
    if (!scopeHydrated) return
    setStickyScope(userId, scope)
  }, [scope, scopeHydrated, userId])

  const parsed = useMemo(() => parseSigil(query), [query])

  // Effective scope: sigil locks override the chip selection.
  const effectiveScope: Scope = parsed.scope ?? scope

  const buildCtx = useCallback(
    (): CommandRunContext => ({
      push: (href: string) => {
        setOpen(false)
        router.push(href)
      },
      refresh: () => {
        setOpen(false)
        router.refresh()
      },
      close: () => setOpen(false),
      setTheme: (t: "light" | "dark" | "system") => {
        setTheme(t)
        setOpen(false)
      },
      currentTheme: themeRef.current,
    }),
    [router, setTheme],
  )

  // Global window-level keydown:
  //   - ⌘K toggles the dialog
  //   - any registered per-command shortcut fires the command (even when
  //     the palette is closed). We skip the listener if focus is inside an
  //     input/textarea/contenteditable so the operator can still type ⌘T
  //     inside a textfield without firing the cycle-theme command, and we
  //     skip when our own dialog is the focus target.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault()
        setOpen((v) => !v)
        return
      }
      if (open) return
      if (isEditableTarget(e.target)) return
      for (const cmd of ADMIN_COMMANDS) {
        if (!cmd.shortcut) continue
        if (shortcutMatches(cmd.shortcut, e)) {
          e.preventDefault()
          void Promise.resolve(cmd.run(buildCtx()))
          return
        }
      }
    }
    function onCustom() {
      setOpen(true)
    }
    window.addEventListener("keydown", onKey)
    window.addEventListener("admin:open-cmdk", onCustom)
    return () => {
      window.removeEventListener("keydown", onKey)
      window.removeEventListener("admin:open-cmdk", onCustom)
    }
  }, [open, buildCtx])

  useEffect(() => {
    if (open) setRecents(readRecents(userId))
  }, [open, userId])

  // Reset sub-mode state whenever the dialog closes.
  useEffect(() => {
    if (!open) {
      setMode({ kind: "root" })
      setPickItems([])
    }
  }, [open])

  // Live search uses the sigil-stripped query.
  useEffect(() => {
    if (debounceRef.current) window.clearTimeout(debounceRef.current)
    const q = parsed.effectiveQuery.trim()
    if (!q || q.length < 2) {
      setResults([])
      return
    }
    debounceRef.current = window.setTimeout(() => {
      void (async () => {
        try {
          const next = await searchAllAction(q)
          setResults(next)
        } catch {
          setResults([])
        }
      })()
    }, 200)
    return () => {
      if (debounceRef.current) window.clearTimeout(debounceRef.current)
    }
  }, [parsed.effectiveQuery])

  const go = useCallback(
    (href: string, label: string) => {
      pushRecent(userId, { href, label, at: Date.now() })
      setOpen(false)
      router.push(href)
    },
    [router, userId],
  )

  const advanceSubcommand = useCallback(
    async (cmd: AdminCommand, step: number, data: Record<string, unknown>) => {
      const cfg: SubcommandConfig | undefined = cmd.subcommand
      if (!cfg) return
      if (step >= cfg.prompts.length) {
        setOpen(false)
        await Promise.resolve(cmd.run(buildCtx(), data))
        return
      }
      const next: SubcommandPrompt | undefined = cfg.prompts[step]
      if (!next) {
        setOpen(false)
        await Promise.resolve(cmd.run(buildCtx(), data))
        return
      }
      setMode({ kind: "subcommand", cmd, step, data })
      setQuery("")
      if (next.kind === "pick") {
        try {
          const items = await next.fetch()
          setPickItems(items)
        } catch {
          setPickItems([])
          toast.error("Failed to load options")
        }
      } else {
        setPickItems([])
      }
    },
    [buildCtx],
  )

  const runCommand = useCallback(
    (cmd: AdminCommand) => {
      if (cmd.subcommand) {
        void advanceSubcommand(cmd, 0, {})
        return
      }
      const ctx = buildCtx()
      setOpen(false)
      void Promise.resolve(cmd.run(ctx))
    },
    [advanceSubcommand, buildCtx],
  )

  const handleSubPick = useCallback(
    (item: { id: string; label: string; sublabel?: string }) => {
      if (mode.kind !== "subcommand") return
      const cfg = mode.cmd.subcommand
      const prompt = cfg?.prompts[mode.step]
      if (!prompt || prompt.kind !== "pick") return
      const nextData = { ...mode.data, [prompt.key]: item }
      void advanceSubcommand(mode.cmd, mode.step + 1, nextData)
    },
    [advanceSubcommand, mode],
  )

  const handleSubInputSubmit = useCallback(
    (value: string) => {
      if (mode.kind !== "subcommand") return
      const cfg = mode.cmd.subcommand
      const prompt = cfg?.prompts[mode.step]
      if (!prompt || prompt.kind !== "input") return
      const trimmed = value.trim()
      const validation = prompt.validate ? prompt.validate(trimmed) : null
      if (validation) {
        toast.error(validation)
        return
      }
      const nextData = { ...mode.data, [prompt.key]: trimmed }
      void advanceSubcommand(mode.cmd, mode.step + 1, nextData)
    },
    [advanceSubcommand, mode],
  )

  const handleSubConfirm = useCallback(() => {
    if (mode.kind !== "subcommand") return
    void advanceSubcommand(mode.cmd, mode.step + 1, mode.data)
  }, [advanceSubcommand, mode])

  const popMode = useCallback(() => {
    if (mode.kind !== "subcommand") return
    if (mode.step === 0) {
      setMode({ kind: "root" })
      setPickItems([])
      setQuery("")
      return
    }
    void advanceSubcommand(mode.cmd, mode.step - 1, mode.data)
  }, [advanceSubcommand, mode])

  const onOpenChange = useCallback(
    (next: boolean) => {
      if (!next && mode.kind === "subcommand") {
        // ESC inside a sub-mode pops one level instead of closing.
        popMode()
        return
      }
      setOpen(next)
    },
    [mode.kind, popMode],
  )

  // Sigil click on a chip clears the sigil prefix.
  const setScopeFromChip = useCallback(
    (next: Scope) => {
      if (parsed.sigil) {
        setQuery(parsed.effectiveQuery)
      }
      setScope(next)
    },
    [parsed.effectiveQuery, parsed.sigil],
  )

  const liveResults = useMemo(() => {
    if (parsed.liveKind) {
      return results.filter((r) => r.kind === parsed.liveKind)
    }
    return results
  }, [parsed.liveKind, results])

  const breadcrumb = useMemo(() => {
    if (mode.kind !== "subcommand") return null
    const cfg = mode.cmd.subcommand
    if (!cfg) return null
    const promptLabels = cfg.prompts.slice(0, mode.step + 1).map((p) => {
      if (p.kind === "pick") return `pick ${p.key}`
      if (p.kind === "input") return `enter ${p.key}`
      return "confirm"
    })
    return [mode.cmd.label, ...promptLabels.slice(0, -1)].concat(
      promptLabels.slice(-1),
    )
  }, [mode])

  return (
    <CommandDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Command palette"
      description="Run commands, jump to pages, search organizations / users / audit"
      className="sm:max-w-xl"
    >
      {mode.kind === "subcommand" && breadcrumb ? (
        <div className="flex flex-wrap items-center gap-1 border-b border-border px-3 py-1.5 text-xs text-muted-foreground">
          {breadcrumb.map((b, i) => (
            <Fragment key={`crumb-${i}`}>
              <span
                className={i === breadcrumb.length - 1 ? "text-foreground" : ""}
              >
                {b}
              </span>
              {i < breadcrumb.length - 1 ? <span>›</span> : null}
            </Fragment>
          ))}
        </div>
      ) : null}
      <CommandInput
        placeholder={
          mode.kind === "subcommand"
            ? subcommandPlaceholder(mode)
            : "Run a command or search…"
        }
        value={query}
        onValueChange={setQuery}
      />
      {mode.kind === "root" ? (
        <ScopeChips
          scope={effectiveScope}
          locked={parsed.scope !== null}
          setScope={setScopeFromChip}
        />
      ) : null}
      {mode.kind === "root" ? (
        <CommandListBody
          query={parsed.effectiveQuery}
          scope={effectiveScope}
          recents={recents}
          results={liveResults}
          showAiPlaceholder={parsed.ai}
          onSelectPage={go}
          onRunCommand={runCommand}
        />
      ) : (
        <SubcommandBody
          mode={mode}
          query={query}
          pickItems={pickItems}
          onPick={handleSubPick}
          onInputSubmit={handleSubInputSubmit}
          onConfirm={handleSubConfirm}
          onBack={popMode}
        />
      )}
      <Separator />
      <CommandFooter
        query={parsed.effectiveQuery}
        commandCount={ADMIN_COMMANDS.length}
        routeCount={ROUTE_REGISTRY.length}
        resultCount={liveResults.length}
        sigil={parsed.sigil}
      />
    </CommandDialog>
  )
}

function subcommandPlaceholder(mode: ModeSubcommand): string {
  const cfg = mode.cmd.subcommand
  const prompt = cfg?.prompts[mode.step]
  if (!prompt) return "…"
  if (prompt.kind === "pick") return `Pick a ${prompt.key}…`
  if (prompt.kind === "input") return prompt.placeholder
  return "Type ENTER to confirm, ESC to cancel"
}

function ScopeChips({
  scope,
  locked,
  setScope,
}: {
  scope: Scope
  locked: boolean
  setScope: (s: Scope) => void
}) {
  return (
    <div className="flex items-center gap-1 border-b border-border px-3 py-1.5">
      {SCOPES.map((s) => (
        <button
          key={s.key}
          type="button"
          onClick={() => setScope(s.key)}
          className={
            scope === s.key
              ? "rounded-md bg-muted px-2 py-0.5 text-xs font-medium text-foreground"
              : "rounded-md px-2 py-0.5 text-xs text-muted-foreground hover:bg-muted/60 hover:text-foreground"
          }
        >
          {s.label}
        </button>
      ))}
      {locked ? (
        <span className="ml-2 rounded-md bg-primary/10 px-2 py-0.5 text-[10px] font-medium tracking-wide text-primary uppercase">
          locked
        </span>
      ) : null}
    </div>
  )
}

function CommandFooter({
  query,
  commandCount,
  routeCount,
  resultCount,
  sigil,
}: {
  query: string
  commandCount: number
  routeCount: number
  resultCount: number
  sigil: string | null
}) {
  return (
    <div className="flex items-center justify-between gap-3 px-3 py-2 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-1.5">
        <Hash className="size-3" aria-hidden />
        <span>
          {commandCount} commands · {routeCount} pages
          {query.trim().length >= 2 ? ` · ${resultCount} live hits` : ""}
          {sigil ? ` · sigil ${sigil}` : ""}
        </span>
      </div>
      <KbdGroup>
        <Kbd>↑</Kbd>
        <Kbd>↓</Kbd>
        <span className="px-0.5">
          <ArrowUpDown className="inline size-3" aria-hidden />
        </span>
        <Kbd>↵</Kbd>
        <span className="px-0.5">
          <CornerDownLeft className="inline size-3" aria-hidden /> open
        </span>
        <Kbd>esc</Kbd>
        <span className="px-0.5">close</span>
      </KbdGroup>
    </div>
  )
}

function HighlightedLabel({ label, query }: { label: string; query: string }) {
  const q = query.trim().toLowerCase()
  if (q.length === 0) return <>{label}</>
  const lower = label.toLowerCase()
  const idx = lower.indexOf(q)
  if (idx < 0) return <>{label}</>
  return (
    <>
      {label.slice(0, idx)}
      <span className="font-semibold text-foreground">
        {label.slice(idx, idx + q.length)}
      </span>
      {label.slice(idx + q.length)}
    </>
  )
}

function CommandListBody({
  query,
  scope,
  recents,
  results,
  showAiPlaceholder,
  onSelectPage,
  onRunCommand,
}: {
  query: string
  scope: Scope
  recents: CmdkRecent[]
  results: SearchResult[]
  showAiPlaceholder: boolean
  onSelectPage: (href: string, label: string) => void
  onRunCommand: (cmd: AdminCommand) => void
}) {
  const q = query.trim()
  const showCommands = scope === "all" || scope === "commands"
  const showPages = scope === "all" || scope === "pages"
  const showLive = scope === "all" || scope === "live"

  const filteredCommands = showCommands
    ? ADMIN_COMMANDS.map((c) => ({ c, score: scoreCommand(q, c) }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map((x) => x.c)
    : []

  const filteredPages = showPages
    ? q.length === 0
      ? ROUTE_REGISTRY
      : ROUTE_REGISTRY.map((p) => ({ p, score: scorePage(q, p) }))
          .filter((x) => x.score > 0)
          .sort((a, b) => b.score - a.score)
          .slice(0, 25)
          .map((x) => x.p)
    : []

  const liveResults = showLive ? results : []

  const totalHits =
    filteredCommands.length + filteredPages.length + liveResults.length
  const pagesBySection = new Map<string, RouteEntry[]>()
  for (const p of filteredPages) {
    const arr = pagesBySection.get(p.section) ?? []
    arr.push(p)
    pagesBySection.set(p.section, arr)
  }

  const commandsByGroup = new Map<string, AdminCommand[]>()
  for (const c of filteredCommands) {
    const arr = commandsByGroup.get(c.group) ?? []
    arr.push(c)
    commandsByGroup.set(c.group, arr)
  }

  return (
    <CommandList>
      <CommandEmpty>
        {q.length === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search aria-hidden />
              </EmptyMedia>
              <EmptyTitle>Search the admin</EmptyTitle>
              <EmptyDescription>
                {ROUTE_REGISTRY.length} pages indexed plus live results across
                organizations, users, workspaces, audit events, and tool calls.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : totalHits === 0 ? (
          <Empty className="border-none">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Search aria-hidden />
              </EmptyMedia>
              <EmptyTitle>No matches</EmptyTitle>
              <EmptyDescription>
                Try a different keyword, slug, email, or audit action.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        ) : null}
      </CommandEmpty>
      {q.length === 0 && recents.length > 0 && scope === "all" ? (
        <>
          <CommandGroup heading="Recents">
            {recents.map((r) => (
              <CommandItem
                key={r.href}
                value={"recent:" + r.href}
                onSelect={() => onSelectPage(r.href, r.label)}
                className="py-2.5"
              >
                <span>{r.label}</span>
              </CommandItem>
            ))}
          </CommandGroup>
          <CommandSeparator />
        </>
      ) : null}
      {Array.from(commandsByGroup.entries()).map(([group, cmds], idx, arr) => (
        <Fragment key={`cmd:${group}`}>
          <CommandGroup heading={`Commands · ${group}`}>
            {cmds.map((c) => {
              const Icon = c.icon
              return (
                <CommandItem
                  key={c.id}
                  value={"cmd:" + c.id}
                  onSelect={() => onRunCommand(c)}
                  className="py-2.5"
                >
                  <Icon aria-hidden />
                  <span>
                    <HighlightedLabel label={c.label} query={q} />
                  </span>
                  {c.shortcut ? (
                    renderShortcut(c.shortcut)
                  ) : c.hint ? (
                    <span className="ml-auto text-xs text-muted-foreground">
                      {c.hint}
                    </span>
                  ) : null}
                </CommandItem>
              )
            })}
          </CommandGroup>
          {idx < arr.length - 1 ||
          pagesBySection.size > 0 ||
          liveResults.length > 0 ? (
            <CommandSeparator />
          ) : null}
        </Fragment>
      ))}
      {Array.from(pagesBySection.entries()).map(
        ([section, pages], idx, arr) => (
          <Fragment key={section}>
            <CommandGroup heading={section}>
              {pages.map((p) => (
                <CommandItem
                  key={p.href}
                  value={"page:" + p.href}
                  onSelect={() => onSelectPage(p.href, p.label)}
                  className="py-2.5"
                >
                  <span>
                    <HighlightedLabel label={p.label} query={q} />
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
            {idx < arr.length - 1 || liveResults.length > 0 ? (
              <CommandSeparator />
            ) : null}
          </Fragment>
        ),
      )}
      {liveResults.length > 0 ? (
        <CommandGroup heading="Live results">
          {liveResults.map((r) => (
            <CommandItem
              key={r.kind + ":" + r.id}
              value={r.kind + ":" + r.id}
              onSelect={() => onSelectPage(r.href, r.label)}
              className="py-2.5"
            >
              <Badge variant={KIND_VARIANT[r.kind]} className="mr-1 capitalize">
                {r.kind}
              </Badge>
              <span>
                <HighlightedLabel label={r.label} query={q} />
              </span>
            </CommandItem>
          ))}
        </CommandGroup>
      ) : null}
      {showAiPlaceholder ? (
        <CommandGroup heading="AI">
          <CommandItem
            value="ai:placeholder"
            disabled
            onSelect={() => toast.info("AI ask ships in Tier 3")}
            className="py-2.5"
          >
            <Sparkles aria-hidden className="text-purple" />
            <span>{`Ask AI: "${q}"`}</span>
            <span className="ml-auto text-xs text-muted-foreground">
              AI ask ships in Tier 3
            </span>
          </CommandItem>
        </CommandGroup>
      ) : null}
    </CommandList>
  )
}

function SubcommandBody({
  mode,
  query,
  pickItems,
  onPick,
  onInputSubmit,
  onConfirm,
  onBack,
}: {
  mode: ModeSubcommand
  query: string
  pickItems: Array<{ id: string; label: string; sublabel?: string }>
  onPick: (item: { id: string; label: string; sublabel?: string }) => void
  onInputSubmit: (value: string) => void
  onConfirm: () => void
  onBack: () => void
}) {
  const cfg = mode.cmd.subcommand
  const prompt: SubcommandPrompt | undefined = cfg?.prompts[mode.step]

  if (!prompt) {
    return (
      <CommandList>
        <CommandEmpty>Loading…</CommandEmpty>
      </CommandList>
    )
  }

  if (prompt.kind === "pick") {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? pickItems.filter(
          (it) =>
            it.label.toLowerCase().includes(q) ||
            (it.sublabel ?? "").toLowerCase().includes(q),
        )
      : pickItems
    return (
      <CommandList>
        <CommandEmpty>No matches</CommandEmpty>
        <CommandGroup heading={`Pick ${prompt.key}`}>
          {filtered.map((it) => (
            <CommandItem
              key={it.id}
              value={"pick:" + it.id}
              onSelect={() => onPick(it)}
              className="py-2.5"
            >
              <span>{it.label}</span>
              {it.sublabel ? (
                <span className="ml-auto text-xs text-muted-foreground">
                  {it.sublabel}
                </span>
              ) : null}
            </CommandItem>
          ))}
        </CommandGroup>
      </CommandList>
    )
  }

  if (prompt.kind === "input") {
    return (
      <CommandList>
        <CommandGroup heading={`Enter ${prompt.key}`}>
          <CommandItem
            key="input:submit"
            value={"input:submit:" + query}
            onSelect={() => onInputSubmit(query)}
            className="py-2.5"
          >
            <span>{query.length === 0 ? prompt.placeholder : query}</span>
            <KbdGroup className="ml-auto">
              <Kbd>↵</Kbd>
            </KbdGroup>
          </CommandItem>
          <CommandItem
            key="input:cancel"
            value="input:cancel"
            onSelect={onBack}
            className="py-2.5"
          >
            <span>Cancel</span>
            <KbdGroup className="ml-auto">
              <Kbd>esc</Kbd>
            </KbdGroup>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    )
  }

  // confirm
  return (
    <CommandList>
      <CommandGroup heading={prompt.title}>
        <CommandItem
          key="confirm:yes"
          value="confirm:yes"
          onSelect={onConfirm}
          className="py-2.5"
        >
          <span>
            {prompt.destructive ? "Confirm (destructive)" : "Confirm"}
          </span>
          <KbdGroup className="ml-auto">
            <Kbd>↵</Kbd>
          </KbdGroup>
        </CommandItem>
        <CommandItem
          key="confirm:no"
          value="confirm:no"
          onSelect={onBack}
          className="py-2.5"
        >
          <span>Cancel</span>
          <KbdGroup className="ml-auto">
            <Kbd>esc</Kbd>
          </KbdGroup>
        </CommandItem>
      </CommandGroup>
      <div className="px-3 py-2 text-xs text-muted-foreground">
        {prompt.description}
      </div>
    </CommandList>
  )
}
