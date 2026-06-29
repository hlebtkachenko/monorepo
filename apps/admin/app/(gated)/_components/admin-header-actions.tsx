"use client"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { useTheme } from "next-themes"

import {
  isLocale,
  localeLabel,
  locales,
  LOCALE_COOKIE,
} from "@workspace/i18n/config"
import { authClient } from "@workspace/auth/client"
import { SidekickMark } from "@workspace/ui/brand-assets"
import { useAppShell } from "@workspace/ui/blocks/app-shell"
import {
  HEADER_MENU,
  HeaderMenuTrigger,
  initialsOf,
  MENU_GAP,
} from "@workspace/ui/blocks/app-header"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
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
import { XIcon } from "@workspace/ui/lib/icons"
import { TooltipProvider } from "@workspace/ui/components/tooltip"
import {
  useIconPack,
  useIcons,
  type IconPackName,
} from "@workspace/ui/icon-packs"

import { clearAdminCookies } from "../sign-out-action"

export interface AdminHeaderActionsProps {
  /** Staff email — drives the avatar fallback initials + identity label. */
  email: string
  /** Build version string (from server `getBuildVersion()`). */
  version?: string
  /** Web app instance origin (WEB_BASE_URL) — target of the "Workspace" link. */
  webUrl: string
}

/**
 * Admin-surface action cluster for the AppHeader `actions` slot. Help menu +
 * Sidekick assistant toggle + a profile menu (workspace link, theme, icon
 * pack, language, sign out). The command palette has no header button — it's
 * keyboard-only (⌘K) plus the Help menu's "Keyboard shortcuts" entry.
 */
export function AdminHeaderActions({
  email,
  version,
  webUrl,
}: AdminHeaderActionsProps) {
  const icons = useIcons()
  const shell = useAppShell()
  const router = useRouter()
  const locale = useLocale()
  const { theme = "system", setTheme } = useTheme()
  const { pack, setPack } = useIconPack()
  const [signOutOpen, setSignOutOpen] = useState(false)

  const ProfileIcon = icons.User
  const WorkspaceIcon = icons.Building2
  const ThemeIcon = icons.Sun
  const IconsIcon = icons.Shapes
  const LanguageIcon = icons.Globe
  const SignOutIcon = icons.XCircle
  const DocsIcon = icons.FileText
  const KeyboardIcon = icons.Command
  const WhatsNewIcon = icons.StickyNotePlus
  const StatusIcon = icons.Activity
  const ExternalIcon = icons.ArrowUpRight

  const openCmdk = () =>
    window.dispatchEvent(new CustomEvent("admin:open-cmdk"))

  const setLocale = (next: string) => {
    if (!isLocale(next)) return
    document.cookie = `${LOCALE_COOKIE}=${encodeURIComponent(next)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`
    router.refresh()
  }

  const signOut = async () => {
    await authClient.signOut()
    // HttpOnly admin-only cookies (step-up token) aren't reachable from client
    // JS — the server action clears them.
    await clearAdminCookies()
    router.push("/auth/login")
    router.refresh()
  }

  return (
    <TooltipProvider delayDuration={200}>
      <DropdownMenu modal={false}>
        <HeaderMenuTrigger tooltip="Get help">
          <IconButton icon="CircleHelp" aria-label="Get help" />
        </HeaderMenuTrigger>
        <DropdownMenuContent
          align="start"
          sideOffset={MENU_GAP}
          className={HEADER_MENU}
        >
          <DropdownMenuItem asChild>
            <a
              href="https://github.com/hlebtkachenko/monorepo/tree/main/docs"
              target="_blank"
              rel="noreferrer"
            >
              <DocsIcon />
              Documentation
              <ExternalIcon className="ml-auto size-3" />
            </a>
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => openCmdk()}>
            <KeyboardIcon />
            Command palette
            <span className="ml-auto text-xs text-muted-foreground">⌘K</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/changelog">
              <WhatsNewIcon />
              What&apos;s new?
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a
              href="https://status.afframe.com"
              target="_blank"
              rel="noreferrer"
            >
              <StatusIcon />
              Status page
              <ExternalIcon className="ml-auto size-3" />
            </a>
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
                <AvatarImage src={undefined} alt={email} />
                <AvatarFallback className="text-[11px] font-medium text-icon-active">
                  {initialsOf(email)}
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
          <DropdownMenuLabel className="flex items-center gap-2 py-1.5 font-normal">
            <Avatar className="size-8 after:hidden">
              <AvatarFallback className="text-[11px] font-medium text-icon-active">
                {initialsOf(email)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-[length:var(--menu-text-size)] font-medium text-foreground">
              {email}
            </span>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/profile">
              <ProfileIcon />
              My profile
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={webUrl} target="_blank" rel="noreferrer">
              <WorkspaceIcon />
              Workspace
              <ExternalIcon className="ml-auto size-3" />
            </a>
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
            <SignOutIcon />
            Sign out
          </DropdownMenuItem>

          <div className="px-2 py-1.5 text-[length:var(--menu-text-size)] text-muted-foreground">
            Version: {version ?? "dev"}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sign out?</AlertDialogTitle>
            <AlertDialogDescription>
              You&apos;ll be returned to the admin sign-in page.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              onClick={() => void signOut()}
            >
              Sign out
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </TooltipProvider>
  )
}
