"use client"

import { type ReactNode, useState } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { useTheme } from "next-themes"
import { LogOut } from "lucide-react"

import {
  locales,
  localeLabel,
  LOCALE_COOKIE,
  isLocale,
} from "@workspace/i18n/config"
import { toast } from "@workspace/ui/components/sonner"

import { BrandName, SidekickMark } from "@workspace/ui/brand-assets"
import {
  BugReportDialog,
  buildBugReport,
  captureContext,
  type CapturedContext,
} from "@workspace/ui/blocks/app-context-menu"
import { useAppShell } from "@workspace/ui/blocks/app-shell"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@workspace/ui/components/alert-dialog"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { XIcon } from "@workspace/ui/lib/icons"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useIcons } from "@workspace/ui/icon-packs"

import { signOutAction } from "../auth/_lib/account-actions"
import { reportFeedback } from "./report-feedback"

// Gap between a header dropdown and its trigger — the same 8px the shell
// uses for its page-edge insets, so menus sit on the same spacing grid.
const MENU_GAP = 8

// Shared sizing for the header dropdowns: 14px text (--menu-text-size),
// 16px icons (default), 8px gap, 6×8px item padding (→32px rows), 8px
// container padding, full-bleed 8px-margin dividers. Width sizes to content
// above the --menu-min-width floor (no magic px), overriding the primitive's
// default trigger-width sizing.
const HEADER_MENU =
  "w-auto min-w-[var(--menu-min-width)] p-2 [&_[data-slot=dropdown-menu-item]]:gap-2 [&_[data-slot=dropdown-menu-item]]:px-2 [&_[data-slot=dropdown-menu-item]]:py-1.5 [&_[data-slot=dropdown-menu-item]]:text-[length:var(--menu-text-size)] [&_[data-slot=dropdown-menu-sub-trigger]]:gap-2 [&_[data-slot=dropdown-menu-sub-trigger]]:px-2 [&_[data-slot=dropdown-menu-sub-trigger]]:py-1.5 [&_[data-slot=dropdown-menu-sub-trigger]]:text-[length:var(--menu-text-size)] [&_[data-slot=dropdown-menu-separator]]:-mx-2 [&_[data-slot=dropdown-menu-separator]]:my-2"

export interface OrgHeaderActionsProps {
  /** Display name — shown in the profile header + drives fallback initials. */
  userName?: string
  /** Profile avatar image URL; falls back to initials when absent. */
  userImage?: string
  /** Active org slug — targets the profile menu's "Settings" link. */
  orgSlug?: string
  /** Build version string (from server `getBuildVersion()`), shown in Help. */
  version?: string
}

/** First initials of the first + last name word, uppercased. */
function initialsOf(name: string | undefined): string {
  if (!name) return "?"
  const parts = name.trim().split(/\s+/)
  const first = parts[0]?.[0] ?? ""
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : ""
  return (first + last).toUpperCase() || "?"
}

/**
 * Wraps a dropdown trigger in a bottom tooltip. IconButton's built-in
 * tooltip can't be used here (it returns a Provider tree, which can't also
 * be a DropdownMenuTrigger asChild target), so the tooltip is composed
 * around the trigger once, here, instead of inline per menu.
 */
function HeaderMenuTrigger({
  tooltip,
  children,
}: {
  tooltip: string
  children: ReactNode
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      </TooltipTrigger>
      <TooltipContent side="bottom" sideOffset={4}>
        {tooltip}
      </TooltipContent>
    </Tooltip>
  )
}

/**
 * Org-surface action cluster for the AppHeader `actions` slot. Composes
 * the shared primitives (IconButton, DropdownMenu, Switch, Avatar) and
 * owns the org's product content + side effects (the support-access
 * toast, the Sidekick → assistant toggle). Admin / other surfaces supply
 * their own cluster.
 */
export function OrgHeaderActions({
  userName,
  userImage,
  orgSlug,
  version,
}: OrgHeaderActionsProps) {
  const icons = useIcons()
  const shell = useAppShell()
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const { theme = "system", setTheme } = useTheme()
  const [supportAccess, setSupportAccess] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackContext, setFeedbackContext] =
    useState<CapturedContext | null>(null)

  const DocsIcon = icons.FileText
  const KnowledgeIcon = icons.BookOpen
  const ContactIcon = icons.MessageCircle
  const KeyboardIcon = icons.Keyboard
  const WhatsNewIcon = icons.GitPullRequestArrow
  const StatusIcon = icons.Activity
  const ExternalIcon = icons.ArrowUpRight
  const InfoIcon = icons.Info
  const ProfileIcon = icons.User
  const WorkspaceIcon = icons.Building2
  const SettingsIcon = icons.Settings
  const ThemeIcon = icons.Sun
  const LanguageIcon = icons.Globe

  // Persist the chosen locale (NEXT_LOCALE cookie, 1y) + refresh so the
  // server re-resolves messages — same mechanism as the footer LanguagePicker.
  const setLocale = (next: string) => {
    if (!isLocale(next)) return
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }

  const settingsHref = orgSlug ? `/${orgSlug}/settings` : "/workspace/settings"

  const setSupport = (next: boolean) => {
    setSupportAccess(next)
    if (next) {
      toast.success("Support access on", {
        description: "Our support team can now view your workspace.",
      })
    } else {
      toast.info("Support access off", {
        description: "Our support team can no longer view your workspace.",
      })
    }
  }

  // "Send feedback" reuses the right-click feedback dialog. There's no
  // clicked element, so capture a page-level context snapshot on open.
  const openFeedback = () => {
    setFeedbackContext(
      captureContext({ target: null, selectionText: null, pathname, orgSlug }),
    )
    setFeedbackOpen(true)
  }

  return (
    <TooltipProvider delayDuration={200}>
      {/* Below md the header band is too narrow for the full cluster (the
          search input flexes to zero width) — only Sidekick + profile stay;
          Get Started, Inbox, Tasks, and Help are desktop-only for v1. */}
      <GetStartedButton />
      <IconButton
        icon="Inbox"
        tooltip="Inbox"
        tooltipSide="bottom"
        className="max-md:hidden"
      />
      <IconButton
        icon="ListTodo"
        tooltip="Tasks"
        tooltipSide="bottom"
        className="max-md:hidden"
      />

      <DropdownMenu modal={false}>
        <HeaderMenuTrigger tooltip="Get help">
          <IconButton
            icon="CircleHelp"
            aria-label="Get help"
            className="max-md:hidden"
          />
        </HeaderMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={MENU_GAP}
          className={HEADER_MENU}
        >
          {/* TODO(org-header): wire real destinations/handlers — placeholders. */}
          <DropdownMenuItem>
            <DocsIcon />
            Documentation
            <ExternalIcon className="ml-auto size-3" />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <KnowledgeIcon />
            Knowledge base
            <ExternalIcon className="ml-auto size-3" />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <ContactIcon />
            Contact us
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <KeyboardIcon />
            Keyboard shortcuts
          </DropdownMenuItem>
          <DropdownMenuItem>
            <WhatsNewIcon />
            What&apos;s new?
          </DropdownMenuItem>
          <DropdownMenuItem>
            <StatusIcon />
            <BrandName /> status
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Grant support access — a real menuitem so it joins the menu's
              roving focus (keyboard reachable). Enter or click toggles; the
              Switch is presentational (pointer-events-none + aria-label) and
              `onSelect` preventDefault keeps the menu open. */}
          <DropdownMenuItem
            className="justify-between"
            onSelect={(e) => {
              e.preventDefault()
              setSupport(!supportAccess)
            }}
          >
            <span className="flex items-center gap-1">
              Support access
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label="About support access"
                    tabIndex={-1}
                    className="inline-flex text-muted-foreground outline-none"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InfoIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-52">
                  Lets our support team sign in to your workspace to help
                  troubleshoot. Turn it off any time.
                </TooltipContent>
              </Tooltip>
            </span>
            <Switch
              checked={supportAccess}
              onCheckedChange={setSupport}
              aria-label="Support access"
              tabIndex={-1}
              className="pointer-events-none"
            />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openFeedback}>
            Send feedback
          </DropdownMenuItem>
          <div className="px-2 py-1.5 text-[length:var(--menu-text-size)] text-muted-foreground">
            Version: {version ?? "dev"}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <IconButton
        tone="sidekick"
        iconNode={
          shell?.assistantOpen ? (
            // Close glyph: 16px X centered in a 20px (--icon-size) slot so the
            // pill width matches the idle spark exactly. Unique icon tone.
            <span className="flex size-[var(--icon-size)] items-center justify-center">
              <XIcon className="size-4 text-sidekick-icon" />
            </span>
          ) : (
            <SidekickMark />
          )
        }
        label="Sidekick"
        labelPosition="beside"
        active={shell?.assistantOpen}
        aria-label="Ask AI Assistant"
        tooltip="Ask AI Assistant"
        tooltipSide="bottom"
        onClick={() => shell?.toggleAssistant()}
      />

      <DropdownMenu modal={false}>
        <HeaderMenuTrigger tooltip="Profile">
          <IconButton
            aria-label="Profile"
            iconNode={
              <Avatar className="size-[var(--icon-size)] after:hidden">
                <AvatarImage src={userImage} alt={userName ?? "Profile"} />
                <AvatarFallback className="text-[11px] font-medium text-icon-active">
                  {initialsOf(userName)}
                </AvatarFallback>
              </Avatar>
            }
          />
        </HeaderMenuTrigger>
        <DropdownMenuContent
          align="end"
          sideOffset={MENU_GAP}
          className={HEADER_MENU}
        >
          {/* Identity — avatar + name only (no email, per spec). */}
          <DropdownMenuLabel className="flex items-center gap-2 py-1.5 font-normal">
            <Avatar className="size-8 after:hidden">
              <AvatarImage src={userImage} alt={userName ?? "Profile"} />
              <AvatarFallback className="text-[11px] font-medium text-icon-active">
                {initialsOf(userName)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-[length:var(--menu-text-size)] font-medium text-foreground">
              {userName ?? "Account"}
            </span>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/workspace/profile">
              <ProfileIcon />
              Profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/workspace">
              <WorkspaceIcon />
              Workspace
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={settingsHref}>
              <SettingsIcon />
              Settings
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ThemeIcon />
              Theme
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="system">
                  System
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">
                  Light
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">Dark</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <LanguageIcon />
              Language
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={locale} onValueChange={setLocale}>
                {locales.map((code) => (
                  <DropdownMenuRadioItem key={code} value={code}>
                    {localeLabel[code]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />

          <DropdownMenuItem onSelect={() => setSignOutOpen(true)}>
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sign-out confirmation — opened from the profile menu, rendered here
          (outside the dropdown) so it survives the menu closing. The confirm
          is a destructive action that submits the real sign-out server action. */}
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll be returned to the sign-in page and need to sign in
              again to access your workspace.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <form action={signOutAction}>
              <AlertDialogAction type="submit" variant="destructive">
                Sign out
              </AlertDialogAction>
            </form>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Shared feedback dialog — opened by "Send feedback" with the
          "Feedback" type preselected; the same dialog the right-click menu
          opens with the "bug" type. */}
      <BugReportDialog
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        defaultType="question"
        context={feedbackContext}
        defaultEmail={null}
        onSubmit={async ({ type, message, email, context }) => {
          await reportFeedback(
            buildBugReport({ ctx: context, type, message, email }),
          )
        }}
      />
    </TooltipProvider>
  )
}

/**
 * "Get Started" CTA — a white pill with the same border as the search
 * input. Visible box 32×90 (h-8, aligned with the 32px IconButton row inside
 * the 40px header); the transparent `before:` overlay extends the hit area to
 * ≥40px for touch (WCAG 2.5.5/2.5.8). Label at the shared `--icon-label-size`.
 */
function GetStartedButton() {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="relative h-8 w-[90px] rounded-md border-input px-0 text-[length:var(--icon-label-size)] text-rail-label-active before:absolute before:-inset-x-1 before:-inset-y-1 before:content-[''] max-md:hidden"
    >
      Get Started
    </Button>
  )
}
