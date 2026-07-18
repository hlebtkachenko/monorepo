"use client"

import { useState, useTransition } from "react"
import Link from "next/link"
import { usePathname, useRouter } from "next/navigation"
import { useLocale } from "next-intl"
import { useTheme } from "next-themes"
import { LogOut } from "lucide-react"

import { useTranslations } from "@workspace/i18n/client"
import {
  locales,
  localeLabel,
  LOCALE_COOKIE,
  isLocale,
} from "@workspace/i18n/config"

import { BRAND_SUPPORT_EMAIL, SidekickMark } from "@workspace/ui/brand-assets"
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
import { XIcon } from "@workspace/ui/lib/icons"
import { Switch } from "@workspace/ui/components/switch"
import { toast } from "@workspace/ui/components/sonner"
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
import { setSupportAccess } from "@/lib/org/support-access-actions"
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
  supportAccessActive = false,
}: {
  userName?: string
  userImage?: string
  slug: string
  version?: string
  /** Server-resolved current support-access grant state (F11). */
  supportAccessActive?: boolean
}) {
  const icons = useIcons()
  const shell = useAppShell()
  const pathname = usePathname()
  const router = useRouter()
  const locale = useLocale()
  const t = useTranslations("org.header")
  const tBrand = useTranslations("brand")
  const { theme = "system", setTheme } = useTheme()
  const { pack, setPack } = useIconPack()
  const [signOutOpen, setSignOutOpen] = useState(false)
  const [feedbackOpen, setFeedbackOpen] = useState(false)
  const [feedbackContext, setFeedbackContext] =
    useState<CapturedContext | null>(null)
  // Support access reflects the server-resolved grant, updated optimistically
  // on toggle and reverted if the server action rejects.
  const [supportOn, setSupportOn] = useState(supportAccessActive)
  const [, startSupportTransition] = useTransition()

  const onToggleSupportAccess = (next: boolean) => {
    setSupportOn(next)
    startSupportTransition(async () => {
      const result = await setSupportAccess(slug, next)
      if (!result.ok) {
        setSupportOn(!next)
        toast.error(t("help.supportAccessError"))
        return
      }
      toast(next ? t("help.supportAccessOn") : t("help.supportAccessOff"))
      router.refresh()
    })
  }

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
        tooltip={t("inbox")}
        tooltipSide="bottom"
        className="max-md:hidden"
      />
      <IconButton
        icon="ListTodo"
        tooltip={t("tasks")}
        tooltipSide="bottom"
        className="max-md:hidden"
      />

      <DropdownMenu modal={false}>
        <HeaderMenuTrigger tooltip={t("getHelp")}>
          <IconButton
            icon="CircleHelp"
            aria-label={t("getHelp")}
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
            {t("help.documentation")}
            <ExternalIcon className="ml-auto size-3" />
          </DropdownMenuItem>
          <DropdownMenuItem>
            <KnowledgeIcon />
            {t("help.knowledgeBase")}
            <ExternalIcon className="ml-auto size-3" />
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <a href={`mailto:${BRAND_SUPPORT_EMAIL}`}>
              <ContactIcon />
              {t("help.contactUs")}
            </a>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem>
            <KeyboardIcon />
            {t("help.keyboardShortcuts")}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <WhatsNewIcon />
            {t("help.whatsNew")}
          </DropdownMenuItem>
          <DropdownMenuItem>
            <StatusIcon />
            {t("help.status", { brand: tBrand("name") })}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {/* Support access consent (F11): the org owner/admin opens a 7-day
              window in which an Afframe operator can sign in to this org via
              admin impersonation. `onSelect` preventDefault keeps the menu open
              so the Switch state is visible after toggling; the toggle calls the
              server action inside a transition and reverts on failure. */}
          <DropdownMenuItem
            className="justify-between"
            onSelect={(e) => e.preventDefault()}
          >
            <span className="flex items-center gap-1">
              {t("help.supportAccess")}
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={t("help.supportAccessInfo")}
                    tabIndex={-1}
                    className="inline-flex text-muted-foreground outline-none"
                    onPointerDown={(e) => e.stopPropagation()}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <InfoIcon className="size-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-52">
                  {t("help.supportAccessTooltip")}
                </TooltipContent>
              </Tooltip>
            </span>
            <Switch
              checked={supportOn}
              onCheckedChange={onToggleSupportAccess}
              aria-label={t("help.supportAccessSwitch")}
            />
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={openFeedback}>
            {t("help.sendFeedback")}
          </DropdownMenuItem>
          <div className="px-2 py-1.5 text-[length:var(--menu-text-size)] text-muted-foreground">
            {t("help.version", { version: version ?? "dev" })}
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
        label={t("sidekick.label")}
        labelPosition="beside"
        active={shell?.assistantOpen}
        aria-label={t("sidekick.ask")}
        tooltip={t("sidekick.ask")}
        tooltipSide="bottom"
        onClick={() => shell?.toggleAssistant()}
      />

      <DropdownMenu modal={false}>
        <HeaderMenuTrigger tooltip={t("profile.tooltip")}>
          <IconButton
            aria-label={t("profile.tooltip")}
            iconNode={
              <Avatar className="size-[var(--icon-size)] after:hidden">
                <AvatarImage
                  src={userImage}
                  alt={userName ?? t("profile.avatarAlt")}
                />
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
              <AvatarImage
                src={userImage}
                alt={userName ?? t("profile.avatarAlt")}
              />
              <AvatarFallback className="text-[11px] font-medium text-icon-active">
                {initialsOf(userName)}
              </AvatarFallback>
            </Avatar>
            <span className="truncate text-[length:var(--menu-text-size)] font-medium text-foreground">
              {userName ?? t("profile.accountFallback")}
            </span>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem asChild>
            <Link href="/workspace/profile">
              <ProfileIcon />
              {t("profile.profile")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href="/workspace">
              <WorkspaceIcon />
              {t("profile.workspace")}
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem asChild>
            <Link href={settingsHref}>
              <SettingsIcon />
              {t("profile.settings")}
            </Link>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ThemeIcon />
              {t("profile.theme")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup value={theme} onValueChange={setTheme}>
                <DropdownMenuRadioItem value="system">
                  {t("profile.themeSystem")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="light">
                  {t("profile.themeLight")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="dark">
                  {t("profile.themeDark")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <IconsIcon />
              {t("profile.icons")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={pack}
                onValueChange={(v) => setPack(v as IconPackName)}
              >
                <DropdownMenuRadioItem value="lucide">
                  {t("profile.iconsLucide")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="phosphor">
                  {t("profile.iconsPhosphor")}
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="fontawesome">
                  {t("profile.iconsFontAwesome")}
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <LanguageIcon />
              {t("profile.language")}
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
            {t("profile.signOut")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Sign-out confirmation — rendered outside the dropdown so it survives
          the menu closing; submits the real sign-out server action. */}
      <AlertDialog open={signOutOpen} onOpenChange={setSignOutOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("signOut.title")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("signOut.description")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("signOut.cancel")}</AlertDialogCancel>
            <form action={signOutAction}>
              <AlertDialogAction type="submit" variant="destructive">
                {t("signOut.confirm")}
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
