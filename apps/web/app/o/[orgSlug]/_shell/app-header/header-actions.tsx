"use client"

import { useState } from "react"
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

import {
  BRAND_SUPPORT_EMAIL,
  BrandName,
  SidekickMark,
} from "@workspace/ui/brand-assets"
import {
  BugReportDialog,
  buildBugReport,
  captureContext,
  type CapturedContext,
} from "@workspace/ui/blocks/app-context-menu"
import { useAppShell } from "@workspace/ui/blocks/app-shell"
import {
  HEADER_MENU,
  HeaderMenuTrigger,
  MENU_GAP,
  initialsOf,
} from "@workspace/ui/blocks/app-header"
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
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { XCircle, XIcon } from "@workspace/ui/lib/icons"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import {
  useIconPack,
  useIcons,
  type IconPackName,
} from "@workspace/ui/icon-packs"

import { orgHref } from "@/lib/org/href"
import { signOutAction } from "@/app/auth/_lib/account-actions"
import { reportFeedback } from "@/app/_components/report-feedback"

/**
 * Header action cluster for the rebuilt org tree — the new tree's own copy of
 * the org header (it does not reuse the frozen old `app/_components/
 * org-header-actions.tsx`). Composes the shared `@workspace/ui` primitives and
 * owns the product content: Help menu, Tasks/Inbox placeholders (not wired
 * yet), the Sidekick → assistant toggle, and the profile menu. Deliberately
 * omits the old surface's "Get Started" CTA and the header search box (the
 * shell renders the header with `search={false}`). Every org-scoped link goes
 * through `orgHref` so the temporary `/o` prefix lives in one place.
 */
export function OrgHeaderActions({
  userName,
  userImage,
  slug,
  version,
}: {
  userName?: string
  userImage?: string
  slug: string
  version?: string
}) {
  const icons = useIcons()
  const shell = useAppShell()
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const { theme = "system", setTheme } = useTheme()
  const { pack, setPack } = useIconPack()
  const [supportAccess, setSupportAccess] = useState(false)
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackContext, setFeedbackContext] =
    useState<CapturedContext | null>(null)

  const DocsIcon = icons.FileText
  const KnowledgeIcon = icons.BookOpen
  const ContactIcon = icons.MessageCircle
  const KeyboardIcon = icons.Command
  const WhatsNewIcon = icons.StickyNotePlus
  const StatusIcon = icons.Activity
  const ExternalIcon = icons.ArrowUpRight
  const InfoIcon = icons.Info
  const ProfileIcon = icons.User
  const WorkspaceIcon = icons.Building2
  const SettingsIcon = icons.Settings
  const ThemeIcon = icons.Sun
  const LanguageIcon = icons.Globe
  const IconsIcon = icons.Shapes

  // Persist the chosen locale (NEXT_LOCALE cookie, 1y) + refresh so the server
  // re-resolves messages — same mechanism as the footer LanguagePicker.
  const setLocale = (next: string) => {
    if (!isLocale(next)) return
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }

  const settingsHref = orgHref(slug, "settings")

  const setSupport = (next: boolean) => {
    setSupportAccess(next)
    if (next) {
      toast.success("Support access on", {
        description: "Our support team can now view your workspace.",
        closeButton: true,
      })
    } else {
      toast("Support access off", {
        icon: <XCircle className="size-4" />,
        description: "Our support team can no longer view your workspace.",
        closeButton: true,
      })
    }
  }

  // "Send feedback" reuses the right-click feedback dialog. There's no clicked
  // element, so capture a page-level context snapshot on open.
  const openFeedback = () => {
    setFeedbackContext(
      captureContext({
        target: null,
        selectionText: null,
        pathname,
        orgSlug: slug,
      }),
    )
    setFeedbackOpen(true)
  }

  return (
    <TooltipProvider delayDuration={200}>
      {/* Tasks + Inbox are placeholders for now — no target wired yet. */}
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
          {/* Documentation / Knowledge base / What's new / Status stay
              placeholders until docs.afframe.com + status.afframe.com are live;
              "Contact us" needs no site, so it is wired. */}
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
          <DropdownMenuItem asChild>
            <a href={`mailto:${BRAND_SUPPORT_EMAIL}`}>
              <ContactIcon />
              Contact us
            </a>
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
              roving focus. Enter or click toggles; the Switch is presentational
              and `onSelect` preventDefault keeps the menu open. */}
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
              <IconsIcon />
              Icons
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={pack}
                onValueChange={(v) => setPack(v as IconPackName)}
              >
                <DropdownMenuRadioItem value="lucide">
                  Lucide
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="phosphor">
                  Phosphor
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="fontawesome">
                  Font Awesome
                </DropdownMenuRadioItem>
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

          <DropdownMenuItem
            variant="destructive"
            onSelect={() => setSignOutOpen(true)}
          >
            <LogOut />
            Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sign-out confirmation — rendered outside the dropdown so it survives
          the menu closing; submits the real sign-out server action. */}
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

      {/* Shared feedback dialog — opened by "Send feedback". */}
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
