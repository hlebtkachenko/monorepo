"use client"

import { BrandName } from "@workspace/ui/brand-assets"
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { IconButton } from "@workspace/ui/components/icon-button"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useIcons } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

export interface AppHeaderProps {
  /** Placeholder for the centered search input. */
  searchPlaceholder?: string
  /** Display name — drives the profile avatar fallback initials. */
  userName?: string
  /** Profile avatar image URL; falls back to initials when absent. */
  userImage?: string
  /** Build version string (from server `getBuildVersion()`), shown in Help. */
  version?: string
  /** Fired when the "Grant support access" switch toggles. The app wires
   *  the side effect (e.g. a toast) so the block stays presentational. */
  onGrantSupportAccessChange?: (granted: boolean) => void
  className?: string
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
 * App-shell header bar — fills the AppShell `header` slot (rail → right
 * inset, `--shell-header-height` tall).
 *
 * Search is centered to the SCREEN, not the header: the header's left
 * edge sits at the rail width, so the search is offset `50vw` by that
 * width. Using the `--shell-rail-width` var keeps it centered when the
 * rail collapses.
 */
export function AppHeader({
  searchPlaceholder = "Search…",
  userName,
  userImage,
  version,
  onGrantSupportAccessChange,
  className,
}: AppHeaderProps) {
  const icons = useIcons()
  const SearchIcon = icons.Search
  // Help-menu icons (16px leading; 12px external-link arrow), from the pack.
  const DocsIcon = icons.FileText
  const KnowledgeIcon = icons.BookOpen
  const ContactIcon = icons.MessageCircle
  const KeyboardIcon = icons.Keyboard
  const WhatsNewIcon = icons.GitPullRequestArrow
  const StatusIcon = icons.Activity
  const ExternalIcon = icons.ArrowUpRight
  const InfoIcon = icons.Info
  return (
    <div
      data-slot="app-header"
      className={cn("relative size-full bg-yellow-400", className)}
    >
      {/* TEMP safe-zone guide: red hazard stripes on the 5px top/bottom +
          10px left/right margins; clear inner zone. Remove when done. */}
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "repeating-linear-gradient(45deg, #ef4444 0, #ef4444 4px, transparent 4px, transparent 8px)",
        }}
      >
        <div
          className="absolute bg-yellow-400"
          style={{ top: 5, bottom: 5, left: 10, right: 10 }}
        />
      </div>

      {/* TEMP zone guides: 400px-wide blue-striped bands flanking the
          center search — where left/right components will live. */}
      <div
        className="pointer-events-none absolute w-[400px]"
        style={{
          top: 5,
          bottom: 5,
          left: 10,
          background:
            "repeating-linear-gradient(45deg, #3b82f6 0, #3b82f6 4px, transparent 4px, transparent 8px)",
        }}
      />
      {/* Actions zone — fixed named region for account + action controls
          (avatar, assistant toggle, notifications, CTA, …). Future items
          mount here, right-aligned. TEMP: blue tint + fixed 400px width so
          it's visible while empty; drop both once real items land. */}
      <div
        data-slot="app-header-actions"
        className="absolute top-[5px] right-[10px] bottom-[5px] flex w-[400px] items-center justify-end gap-2"
        // TEMP tint sits in the container background → always behind the
        // action items; 50% transparent so the items read clearly.
        style={{
          background:
            "repeating-linear-gradient(45deg, rgba(59,130,246,0.5) 0, rgba(59,130,246,0.5) 4px, transparent 4px, transparent 8px)",
        }}
      >
        <TooltipProvider delayDuration={200}>
          <IconButton icon="Inbox" tooltip="Inbox" tooltipSide="bottom" />
          <IconButton icon="ListTodo" tooltip="Tasks" tooltipSide="bottom" />
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <IconButton icon="CircleHelp" aria-label="Help" />
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                Help
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent
              align="end"
              sideOffset={6}
              // 12px item text; leading icons use the menu's default 16px.
              className="w-[180px] [&_[data-slot=dropdown-menu-item]]:text-[12px]"
            >
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
              {/* Grant support access — Switch + info tooltip. This row is
                  not a menu-item, so toggling never closes the menu. */}
              <div className="flex items-center justify-between px-1.5 py-1 text-[12px]">
                <span className="flex items-center gap-1">
                  Grant support access
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        aria-label="About support access"
                        className="text-muted-foreground outline-none"
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
                <Switch onCheckedChange={onGrantSupportAccessChange} />
              </div>
              <DropdownMenuItem>Send feedback</DropdownMenuItem>
              <div className="px-1.5 py-1 text-[12px]">
                Version: {version ?? "dev"}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
          <IconButton
            iconNode={<SidekickSparkIcon />}
            tooltip="Ask AI Assistant"
            tooltipSide="bottom"
          />
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <IconButton
                    aria-label="Profile"
                    iconNode={
                      <Avatar className="size-[var(--icon-size)] after:hidden">
                        <AvatarImage
                          src={userImage}
                          alt={userName ?? "Profile"}
                        />
                        <AvatarFallback className="text-[11px] font-medium text-icon-active">
                          {initialsOf(userName)}
                        </AvatarFallback>
                      </Avatar>
                    }
                  />
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent side="bottom" sideOffset={4}>
                Profile
              </TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" sideOffset={6}>
              <DropdownMenuItem>Lorem ipsum dolor sit amet.</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </TooltipProvider>
      </div>

      <div
        className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2"
        style={{
          left: "calc(50vw - var(--shell-rail-width))",
          width: "clamp(160px, calc(100vw - 360px), 400px)",
        }}
      >
        <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-icon" />
        <Input
          type="search"
          aria-label="Search"
          placeholder={searchPlaceholder}
          className="h-7 pl-8"
        />
      </div>
    </div>
  )
}

/**
 * Sidekick brand mark — a rounded-square tile with the accent spark.
 * Custom artwork (its own colors), passed to IconButton via `iconNode`.
 */
function SidekickSparkIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 16 16"
      color="#4f5255"
      aria-hidden
      className={cn("size-[var(--icon-size)] shrink-0", className)}
    >
      <path
        fill="#fff"
        d="M3.403 1.38h9.204c1.118 0 2.023.906 2.023 2.023v9.204a2.023 2.023 0 0 1-2.023 2.023H3.403a2.024 2.024 0 0 1-2.024-2.023V3.403c0-1.117.907-2.023 2.024-2.023"
      />
      <path
        fill="currentColor"
        d="M14.63 3.403v7.184c-.435-.17-.882-.346-1.174-.457-.676-.258-1.234-.85-1.549-1.68-.116-.305-.217-.862-.259-1.184-.13-1.003-.357-3.015-.52-4.013-.053-.317-.523-.317-.575 0-.163.998-.39 3.01-.52 4.013-.046.358-.13.848-.259 1.185-.31.812-.856 1.413-1.55 1.679-.538.206-1.608.633-2.15.831a.282.282 0 0 0 0 .531c.495.18 1.477.564 1.971.742.905.327 1.404.771 1.771 1.68.073.18.176.445.282.716H3.403a2.023 2.023 0 0 1-2.024-2.023V3.403c0-1.117.907-2.023 2.024-2.023h9.204c1.118 0 2.023.906 2.023 2.023m-.995 8.832c.25-.09.623-.232.995-.375v.748a2.023 2.023 0 0 1-2.023 2.022h-1.025c.106-.27.21-.536.283-.716.365-.904.865-1.352 1.77-1.68"
      />
      <path
        fill="#fff"
        d="M5.3 3.05q.27 2.25.63 3.92.48.31 1.29.63-.81.23-1.29.63-.36.44-.63 1.3-.27-.86-.63-1.3-.48-.4-1.3-.63.82-.32 1.3-.63.36-1.67.63-3.92"
      />
    </svg>
  )
}
