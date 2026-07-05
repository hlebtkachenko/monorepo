"use client"

import type { LucideIcon } from "lucide-react"
import {
  Clipboard,
  Copy,
  Download,
  ExternalLink,
  Flag,
  GitBranch,
  Globe,
  Link as LinkIcon,
  LogOut,
  Palette,
  RefreshCw,
  UserMinus,
  UserPlus,
  UserX,
} from "lucide-react"
import { toast } from "sonner"

import { exportOrgsCsv } from "../orgs/actions"
import { exportUsersCsv } from "../users/actions"
import { exportLatestAuditCsv } from "../compliance/audit/actions"
import {
  listFeatureFlagsForCommand,
  toggleFeatureFlag,
} from "../_actions/feature-flags"
import { stopImpersonation } from "@/lib/admin-impersonation"

export type CommandRunContext = {
  push: (href: string) => void
  refresh: () => void
  close: () => void
  setTheme: (t: "light" | "dark" | "system") => void
  currentTheme: string | undefined
}

type CommandModifier = "meta" | "shift" | "alt"

export interface CommandShortcut {
  mods: ReadonlyArray<CommandModifier>
  key: string
}

interface SubcommandPickPrompt {
  kind: "pick"
  key: string
  fetch: () => Promise<Array<{ id: string; label: string; sublabel?: string }>>
}

interface SubcommandInputPrompt {
  kind: "input"
  key: string
  placeholder: string
  validate?: (v: string) => string | null
}

interface SubcommandConfirmPrompt {
  kind: "confirm"
  title: string
  description: string
  destructive?: boolean
}

export type SubcommandPrompt =
  | SubcommandPickPrompt
  | SubcommandInputPrompt
  | SubcommandConfirmPrompt

export interface SubcommandConfig {
  prompts: ReadonlyArray<SubcommandPrompt>
}

export interface AdminCommand {
  id: string
  label: string
  hint?: string
  icon: LucideIcon
  group: string
  keywords?: string
  shortcut?: CommandShortcut
  subcommand?: SubcommandConfig
  run: (
    ctx: CommandRunContext,
    data?: Record<string, unknown>,
  ) => void | Promise<void>
}

function triggerDownload(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 500)
}

function nextTheme(current: string | undefined): "light" | "dark" | "system" {
  if (current === "light") return "dark"
  if (current === "dark") return "system"
  return "light"
}

export const ADMIN_COMMANDS: AdminCommand[] = [
  {
    id: "theme.cycle",
    label: "Cycle theme (light → dark → system)",
    icon: Palette,
    group: "Preferences",
    keywords: "theme light dark system appearance mode cycle",
    shortcut: { mods: ["meta"], key: "T" },
    run: ({ setTheme, currentTheme }) => setTheme(nextTheme(currentTheme)),
  },
  {
    id: "page.reload",
    label: "Reload current page",
    hint: "Refetch server data",
    icon: RefreshCw,
    group: "Actions",
    keywords: "reload refresh refetch",
    run: ({ refresh }) => refresh(),
  },
  {
    id: "page.copy-url",
    label: "Copy current page URL",
    hint: "Clipboard",
    icon: Copy,
    group: "Actions",
    keywords: "copy url clipboard link share",
    run: async () => {
      if (typeof window === "undefined") return
      try {
        await navigator.clipboard.writeText(window.location.href)
        toast.success("URL copied")
      } catch {
        toast.error("Could not copy")
      }
    },
  },
  {
    id: "export.orgs.csv",
    label: "Export organizations as CSV",
    hint: "10k row cap",
    icon: Download,
    group: "Exports",
    keywords: "export download csv organizations orgs",
    run: async () => {
      toast.loading("Exporting organizations…", { id: "export-orgs" })
      const result = await exportOrgsCsv({ filters: {} })
      toast.dismiss("export-orgs")
      if (result.ok) {
        triggerDownload(result.filename, result.csv)
        toast.success(`Exported ${result.filename}`)
      } else {
        toast.error(result.error)
      }
    },
  },
  {
    id: "export.users.csv",
    label: "Export users as CSV",
    hint: "10k row cap",
    icon: Download,
    group: "Exports",
    keywords: "export download csv users",
    run: async () => {
      toast.loading("Exporting users…", { id: "export-users" })
      const result = await exportUsersCsv({ filters: {} })
      toast.dismiss("export-users")
      if (result.ok) {
        triggerDownload(result.filename, result.csv)
        toast.success(`Exported ${result.filename}`)
      } else {
        toast.error(result.error)
      }
    },
  },
  {
    id: "export.audit.csv",
    label: "Export audit log (last 1000) as CSV",
    hint: "1k row cap",
    icon: Download,
    group: "Exports",
    keywords: "export download csv audit log compliance",
    run: async () => {
      toast.loading("Exporting audit log…", { id: "export-audit" })
      const result = await exportLatestAuditCsv({})
      toast.dismiss("export-audit")
      if (result.ok) {
        triggerDownload(result.filename, result.csv)
        toast.success(`Exported ${result.filename}`)
      } else {
        toast.error(result.error)
      }
    },
  },
  {
    id: "impersonation.stop",
    label: "Stop my active impersonation",
    hint: "Ends the 30-min window",
    icon: UserMinus,
    group: "Security",
    keywords: "stop end impersonation impersonating banner",
    run: async ({ refresh }) => {
      const result = await stopImpersonation()
      if (result.ok) {
        toast.success("Impersonation stopped")
        refresh()
      } else {
        toast.error(result.error ?? "No active impersonation to stop")
      }
    },
  },
  {
    id: "external.status",
    label: "Open status.afframe.com (new tab)",
    hint: "OpenStatus uptime",
    icon: ExternalLink,
    group: "Navigation",
    keywords: "status uptime openstatus external incidents",
    run: () => {
      if (typeof window !== "undefined") {
        window.open("https://status.afframe.com", "_blank", "noopener")
      }
    },
  },
  {
    id: "external.linear.aff221",
    label: "Open Linear AFF-221 (master tracker)",
    hint: "New tab",
    icon: ExternalLink,
    group: "Navigation",
    keywords: "linear aff-221 master tracker overnight build issue",
    run: () => {
      if (typeof window !== "undefined") {
        window.open(
          "https://linear.app/hapddev/issue/AFF-221/appsadmin-overnight-build-master-tracker",
          "_blank",
          "noopener",
        )
      }
    },
  },
  {
    id: "dev.copy.build-sha",
    label: "Copy build SHA",
    hint: "Clipboard",
    icon: GitBranch,
    group: "Dev",
    keywords: "copy build sha commit version dev",
    run: async () => {
      if (typeof window === "undefined") return
      const sha = process.env.NEXT_PUBLIC_BUILD_SHA ?? "unknown"
      try {
        await navigator.clipboard.writeText(sha)
        toast.success(`Build SHA copied (${sha})`)
      } catch {
        toast.error("Could not copy")
      }
    },
  },
  {
    id: "dev.copy.origin",
    label: "Copy server origin",
    hint: "Clipboard",
    icon: Globe,
    group: "Dev",
    keywords: "copy server origin url host dev",
    run: async () => {
      if (typeof window === "undefined") return
      try {
        await navigator.clipboard.writeText(window.location.origin)
        toast.success(`Origin copied (${window.location.origin})`)
      } catch {
        toast.error("Could not copy")
      }
    },
  },
  {
    id: "auth.signout",
    label: "Sign out",
    hint: "End this admin session",
    icon: LogOut,
    group: "Account",
    keywords: "sign out logout end session",
    run: ({ push }) => push("/auth/login?signout=1"),
  },
  // === Sub-command-driven verbs (push/pop palette flows) ===
  {
    id: "toggle.flag",
    label: "Toggle feature flag…",
    icon: Flag,
    group: "Dev",
    keywords: "feature flag toggle enable disable kill switch sub-command",
    subcommand: {
      prompts: [
        {
          kind: "pick",
          key: "flag",
          fetch: async () => {
            const result = await listFeatureFlagsForCommand()
            if (!result.ok) {
              toast.error(result.error)
              return []
            }
            return result.flags.map((f) => ({
              id: f.key,
              label: f.key,
              sublabel: f.enabled ? "enabled" : "disabled",
            }))
          },
        },
        {
          kind: "confirm",
          title: "Toggle this flag?",
          description:
            "Flips the current enabled state. Audit row will be written by toggleFeatureFlag.",
        },
      ],
    },
    run: async (_ctx, data) => {
      const picked = (data ?? {}).flag as
        | { id: string; label: string; sublabel?: string }
        | undefined
      if (!picked) {
        toast.error("No flag selected")
        return
      }
      const nextEnabled = picked.sublabel !== "enabled"
      const result = await toggleFeatureFlag({
        key: picked.id,
        enabled: nextEnabled,
      })
      if (result.ok) {
        toast.success(
          `Flag ${picked.id} ${nextEnabled ? "enabled" : "disabled"}`,
        )
      } else {
        toast.error(result.error)
      }
    },
  },
  {
    id: "go.org",
    label: "Go to organization…",
    icon: LinkIcon,
    group: "Navigation",
    keywords: "go to org organization navigate jump slug sub-command",
    subcommand: {
      prompts: [
        {
          kind: "input",
          key: "slug",
          placeholder: "Enter org slug or id",
          validate: (v) => (v.length === 0 ? "Slug required" : null),
        },
      ],
    },
    run: () => {
      toast.info("Wire-up ships next session")
    },
  },
  {
    id: "go.user",
    label: "Go to user…",
    icon: UserPlus,
    group: "Navigation",
    keywords: "go to user navigate jump email sub-command",
    subcommand: {
      prompts: [
        {
          kind: "input",
          key: "email",
          placeholder: "Enter user email",
          validate: (v) => (v.includes("@") ? null : "Must be an email"),
        },
      ],
    },
    run: () => {
      toast.info("Wire-up ships next session")
    },
  },
  {
    id: "annotate.run",
    label: "Annotate agent run…",
    icon: Clipboard,
    group: "Agents",
    keywords: "annotate run agent comment note sub-command",
    subcommand: {
      prompts: [
        {
          kind: "input",
          key: "annotation",
          placeholder: "Annotation text",
        },
        {
          kind: "confirm",
          title: "Save annotation?",
          description: "Writes the annotation against the current run.",
        },
      ],
    },
    run: () => {
      toast.info("Wire-up ships next session")
    },
  },
  {
    id: "revoke.session",
    label: "Revoke user session…",
    icon: UserX,
    group: "Security",
    keywords: "revoke session user kick logout sub-command",
    subcommand: {
      prompts: [
        {
          kind: "input",
          key: "session_id",
          placeholder: "Enter session id",
        },
        {
          kind: "confirm",
          title: "Revoke this session?",
          description: "The user will be logged out from that device.",
          destructive: true,
        },
      ],
    },
    run: () => {
      toast.info("Wire-up ships next session")
    },
  },
]
