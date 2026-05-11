"use client"

import * as React from "react"
import {
  Battery,
  BookmarkIcon,
  ChevronLeft,
  ChevronRight,
  Download,
  Globe,
  History,
  Home,
  Lock,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Plus,
  RotateCcw,
  Search,
  Settings,
  Shield,
  Square,
  Star,
  StarOff,
  Volume2,
  Wifi,
  X,
} from "lucide-react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Card } from "@workspace/ui/components/card"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

interface Tab {
  id: string
  title: string
  url: string
  favicon?: string
  isActive: boolean
  isLoading: boolean
}

interface Bookmark {
  id: string
  title: string
  url: string
  favicon?: string
}

interface HistoryItem {
  id: string
  title: string
  url: string
  timestamp: Date
  favicon?: string
}

interface BrowserProps {
  image?: string
  initialUrl?: string
  initialTabs?: Partial<Tab>[]
  showWindowControls?: boolean
  showBookmarksBar?: boolean
  showStatusBar?: boolean
  className?: string
  enableTabManagement?: boolean
  enableBookmarks?: boolean
  enableHistory?: boolean
  enableDownloads?: boolean
  enableSettings?: boolean
  maxTabs?: number
  customBookmarks?: Bookmark[]
  customHistory?: HistoryItem[]
  onNavigate?: (url: string, tabId: string) => void
  onTabCreate?: (tab: Tab) => void
  onTabClose?: (tabId: string) => void
  onTabSwitch?: (tabId: string) => void
  onBookmarkToggle?: (url: string, isBookmarked: boolean) => void
  onDownload?: (url: string) => void
  renderContent?: (url: string, isLoading: boolean) => React.ReactNode
  simulateLoading?: boolean
  loadingDuration?: number
}

const DEFAULT_BOOKMARKS: Bookmark[] = [
  { id: "1", title: "Google", url: "https://www.google.com", favicon: "🔍" },
  { id: "2", title: "GitHub", url: "https://github.com", favicon: "🐙" },
  {
    id: "3",
    title: "Stack Overflow",
    url: "https://stackoverflow.com",
    favicon: "📚",
  },
  {
    id: "4",
    title: "MDN Web Docs",
    url: "https://developer.mozilla.org",
    favicon: "📖",
  },
]

// Hour offsets for default history timestamps; resolved lazily inside the
// component to avoid Date.now() running at module scope (SSR hydration drift).
const DEFAULT_HISTORY_OFFSETS_MS: ReadonlyArray<{
  id: string
  title: string
  url: string
  offsetMs: number
  favicon: string
}> = [
  {
    id: "1",
    title: "Google",
    url: "https://www.google.com",
    offsetMs: 3_600_000,
    favicon: "🔍",
  },
  {
    id: "2",
    title: "GitHub",
    url: "https://github.com",
    offsetMs: 7_200_000,
    favicon: "🐙",
  },
  {
    id: "3",
    title: "Stack Overflow",
    url: "https://stackoverflow.com",
    offsetMs: 10_800_000,
    favicon: "📚",
  },
]

function Browser({
  image,
  initialUrl = "https://example.com",
  initialTabs,
  showWindowControls = false,
  showBookmarksBar = false,
  showStatusBar = true,
  className,
  enableTabManagement = false,
  enableBookmarks = true,
  enableHistory = true,
  enableDownloads = true,
  enableSettings = true,
  maxTabs = 10,
  customBookmarks,
  customHistory,
  onNavigate,
  onTabCreate,
  onTabClose,
  onTabSwitch,
  onBookmarkToggle,
  onDownload,
  renderContent,
  simulateLoading = true,
  loadingDuration = 1000,
}: BrowserProps = {}) {
  const [tabs, setTabs] = React.useState<Tab[]>(() => {
    if (initialTabs && initialTabs.length > 0) {
      return initialTabs.map((tab, index) => ({
        id: tab.id ?? `${Date.now()}-${index}`,
        title: tab.title ?? "New Tab",
        url: tab.url ?? initialUrl,
        ...(tab.favicon ? { favicon: tab.favicon } : {}),
        isActive: index === 0,
        isLoading: false,
      }))
    }
    return [
      {
        id: "1",
        title: "New Tab",
        url: initialUrl,
        isActive: true,
        isLoading: false,
      },
    ]
  })

  const [currentUrl, setCurrentUrl] = React.useState(initialUrl)
  const [inputUrl, setInputUrl] = React.useState(initialUrl)
  const [isSecure, setIsSecure] = React.useState(
    initialUrl.startsWith("https://"),
  )
  const [isBookmarked, setIsBookmarked] = React.useState(false)
  const [showBookmarks, setShowBookmarks] = React.useState(false)
  const [showHistory, setShowHistory] = React.useState(false)
  const [showSettings, setShowSettings] = React.useState(false)
  const [isFullscreen, setIsFullscreen] = React.useState(false)
  const [downloadProgress, setDownloadProgress] = React.useState(0)
  const [isDownloading, setIsDownloading] = React.useState(false)

  const bookmarks = customBookmarks ?? DEFAULT_BOOKMARKS
  // Resolving Date.now() inside useMemo (not module scope) is intentional:
  // module-scope evaluation would drift between SSR and CSR.
  // eslint-disable-next-line react-hooks/purity
  const defaultHistory = React.useMemo<HistoryItem[]>(() => {
    const now = Date.now()
    return DEFAULT_HISTORY_OFFSETS_MS.map((item) => ({
      id: item.id,
      title: item.title,
      url: item.url,
      timestamp: new Date(now - item.offsetMs),
      favicon: item.favicon,
    }))
  }, [])
  const history = customHistory ?? defaultHistory

  const activeTab = tabs.find((t) => t.isActive)

  const navigateToUrl = React.useCallback(
    (rawUrl: string) => {
      let url = rawUrl
      if (
        !url.startsWith("http://") &&
        !url.startsWith("https://") &&
        !url.startsWith("about:")
      ) {
        url = `https://www.google.com/search?q=${encodeURIComponent(url)}`
      }
      setCurrentUrl(url)
      setInputUrl(url)
      setIsSecure(url.startsWith("https://"))
      setTabs((prev) =>
        prev.map((tab) => {
          if (!tab.isActive) return tab
          let title = "New Tab"
          try {
            title = new URL(url).hostname || title
          } catch {
            // ignore parsing failure
          }
          return { ...tab, url, title, isLoading: simulateLoading }
        }),
      )
      const activeTabId = tabs.find((t) => t.isActive)?.id ?? ""
      onNavigate?.(url, activeTabId)
      if (simulateLoading) {
        setTimeout(() => {
          setTabs((prev) =>
            prev.map((tab) =>
              tab.isActive ? { ...tab, isLoading: false } : tab,
            ),
          )
        }, loadingDuration)
      }
    },
    [tabs, onNavigate, simulateLoading, loadingDuration],
  )

  const createNewTab = () => {
    if (tabs.length >= maxTabs) return
    const newTab: Tab = {
      id: `${Date.now()}`,
      title: "New Tab",
      url: "about:blank",
      isActive: true,
      isLoading: false,
    }
    setTabs((prev) =>
      prev.map((t) => ({ ...t, isActive: false })).concat(newTab),
    )
    setCurrentUrl("about:blank")
    setInputUrl("")
    onTabCreate?.(newTab)
  }

  const closeTab = (tabId: string) => {
    if (tabs.length === 1) return
    const tabIndex = tabs.findIndex((t) => t.id === tabId)
    if (tabIndex === -1) return
    const wasActive = !!tabs[tabIndex]?.isActive
    const remaining = tabs.filter((t) => t.id !== tabId)
    if (wasActive && remaining.length > 0) {
      const nextIndex = Math.min(tabIndex, remaining.length - 1)
      const next = remaining[nextIndex]
      if (next) {
        setCurrentUrl(next.url)
        setInputUrl(next.url)
      }
      setTabs(
        remaining.map((t, i) =>
          i === nextIndex ? { ...t, isActive: true } : t,
        ),
      )
    } else {
      setTabs(remaining)
    }
    onTabClose?.(tabId)
  }

  const switchTab = (tabId: string) => {
    const newTabs = tabs.map((t) => ({ ...t, isActive: t.id === tabId }))
    const next = newTabs.find((t) => t.isActive)
    if (next) {
      setCurrentUrl(next.url)
      setInputUrl(next.url)
    }
    setTabs(newTabs)
    onTabSwitch?.(tabId)
  }

  const refresh = () => {
    setTabs((prev) =>
      prev.map((t) => (t.isActive ? { ...t, isLoading: true } : t)),
    )
    setTimeout(() => {
      setTabs((prev) =>
        prev.map((t) => (t.isActive ? { ...t, isLoading: false } : t)),
      )
    }, 1000)
  }

  const toggleBookmark = () => {
    const next = !isBookmarked
    setIsBookmarked(next)
    onBookmarkToggle?.(currentUrl, next)
  }

  const simulateDownload = () => {
    onDownload?.(currentUrl)
    if (!enableDownloads) return
    setIsDownloading(true)
    setDownloadProgress(0)
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setIsDownloading(false)
          return 0
        }
        return prev + 10
      })
    }, 200)
  }

  return (
    <div
      data-slot="browser"
      className={cn(
        "flex h-full flex-col overflow-hidden rounded-lg border border-border bg-background",
        isFullscreen && "fixed inset-0 z-50 rounded-none border-0",
        className,
      )}
    >
      {showWindowControls && (
        <div className="flex items-center justify-between border-b border-border bg-muted/50 px-4 py-2">
          <div className="flex gap-2">
            <span className="size-3 rounded-full bg-destructive" />
            <span className="size-3 rounded-full bg-warning" />
            <span className="size-3 rounded-full bg-success" />
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wifi className="size-4" />
            <Volume2 className="size-4" />
            <Battery className="size-4" />
            <span>12:00</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFullscreen(!isFullscreen)}
            >
              {isFullscreen ? <Minimize2 /> : <Maximize2 />}
            </Button>
            <Button variant="ghost" size="sm">
              <Square />
            </Button>
            <Button variant="ghost" size="sm">
              <X />
            </Button>
          </div>
        </div>
      )}

      {enableTabManagement && (
        <div className="flex items-center border-b border-border bg-muted/30">
          <div className="flex flex-1 items-center overflow-x-auto">
            {tabs.map((tab) => (
              <div
                key={tab.id}
                onClick={() => switchTab(tab.id)}
                className={cn(
                  "flex max-w-64 min-w-0 cursor-pointer items-center gap-2 border-r border-border px-4 py-2",
                  tab.isActive ? "bg-background" : "hover:bg-muted/50",
                )}
              >
                <div className="flex min-w-0 flex-1 items-center gap-2">
                  {tab.isLoading ? (
                    <span className="size-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
                  ) : (
                    <Globe className="size-4 shrink-0 text-muted-foreground" />
                  )}
                  <span className="truncate text-sm">{tab.title}</span>
                </div>
                {tabs.length > 1 && (
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation()
                      closeTab(tab.id)
                    }}
                    aria-label="Close tab"
                  >
                    <X />
                  </Button>
                )}
              </div>
            ))}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={createNewTab}
            className="border-l border-border px-3 py-2"
            aria-label="New tab"
          >
            <Plus />
          </Button>
        </div>
      )}

      <div className="flex items-center gap-2 border-b border-border bg-background p-2">
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" disabled aria-label="Back">
            <ChevronLeft />
          </Button>
          <Button variant="ghost" size="sm" disabled aria-label="Forward">
            <ChevronRight />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={refresh}
            aria-label="Reload"
          >
            <RotateCcw />
          </Button>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => navigateToUrl("about:home")}
            aria-label="Home"
          >
            <Home />
          </Button>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault()
            navigateToUrl(inputUrl)
          }}
          className="flex flex-1 items-center"
        >
          <div className="relative flex flex-1 items-center">
            <div className="absolute left-3 flex items-center gap-2">
              {isSecure ? (
                <Lock className="size-4 text-success" />
              ) : (
                <Shield className="size-4 text-muted-foreground" />
              )}
            </div>
            <Input
              value={inputUrl}
              onChange={(e) => setInputUrl(e.target.value)}
              placeholder="Search or enter address"
              aria-label="Address bar"
              className="pr-4 pl-10"
            />
          </div>
        </form>
        <div className="flex items-center gap-1">
          {enableBookmarks && (
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleBookmark}
              aria-label={
                isBookmarked ? "Remove bookmark" : "Bookmark this page"
              }
            >
              {isBookmarked ? (
                <Star className="fill-warning text-warning" />
              ) : (
                <StarOff />
              )}
            </Button>
          )}
          {enableDownloads && (
            <Button
              variant="ghost"
              size="sm"
              onClick={simulateDownload}
              aria-label="Download"
            >
              <Download />
            </Button>
          )}
          {enableSettings && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowSettings(!showSettings)}
              aria-label="More options"
            >
              <MoreHorizontal />
            </Button>
          )}
        </div>
      </div>

      {showBookmarksBar && enableBookmarks && (
        <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-1 text-sm">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setShowBookmarks(!showBookmarks)}
            className="text-xs"
          >
            <BookmarkIcon className="mr-1 size-3" />
            Bookmarks
          </Button>
          {enableHistory && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowHistory(!showHistory)}
              className="text-xs"
            >
              <History className="mr-1 size-3" />
              History
            </Button>
          )}
          <Separator orientation="vertical" className="h-4" />
          {bookmarks.slice(0, 4).map((b) => (
            <Button
              key={b.id}
              variant="ghost"
              size="sm"
              onClick={() => navigateToUrl(b.url)}
              className="text-xs"
            >
              <span className="mr-1">{b.favicon}</span>
              {b.title}
            </Button>
          ))}
        </div>
      )}

      {isDownloading && enableDownloads && (
        <div className="border-b border-border bg-info/10 px-4 py-2">
          <div className="flex items-center gap-2 text-sm">
            <Download className="size-4 text-info" />
            <span>Downloading file</span>
            <div className="h-2 flex-1 rounded-full bg-muted">
              <div
                className="h-2 rounded-full bg-info transition-all duration-200"
                style={{ width: `${downloadProgress}%` }}
              />
            </div>
            <span>{downloadProgress}%</span>
          </div>
        </div>
      )}

      <div className="flex flex-1 overflow-hidden">
        {showBookmarks && enableBookmarks && (
          <Card className="m-2 mr-0 w-80 overflow-y-auto p-4">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <BookmarkIcon className="size-4" /> Bookmarks
            </h3>
            <div className="space-y-2">
              {bookmarks.map((b) => (
                <button
                  type="button"
                  key={b.id}
                  className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-muted"
                  onClick={() => navigateToUrl(b.url)}
                >
                  <span>{b.favicon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {b.title}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {b.url}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {showHistory && enableHistory && (
          <Card className="m-2 mr-0 w-80 overflow-y-auto p-4">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <History className="size-4" /> History
            </h3>
            <div className="space-y-2">
              {history.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className="flex w-full items-center gap-2 rounded p-2 text-left hover:bg-muted"
                  onClick={() => navigateToUrl(item.url)}
                >
                  <span>{item.favicon}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">
                      {item.title}
                    </div>
                    <div className="truncate text-xs text-muted-foreground">
                      {item.url}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {item.timestamp.toLocaleTimeString("en-US")}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </Card>
        )}

        {showSettings && enableSettings && (
          <Card className="m-2 mr-0 w-80 overflow-y-auto p-4">
            <h3 className="mb-4 flex items-center gap-2 font-semibold">
              <Settings className="size-4" /> Settings
            </h3>
            <div className="space-y-4">
              <div>
                <h4 className="mb-2 font-medium">Privacy &amp; Security</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Block pop-ups</span>
                    <Badge variant="secondary">On</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Safe browsing</span>
                    <Badge variant="secondary">Enhanced</Badge>
                  </div>
                </div>
              </div>
              <Separator />
              <div>
                <h4 className="mb-2 font-medium">Appearance</h4>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span>Theme</span>
                    <Badge variant="outline">System</Badge>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Zoom</span>
                    <Badge variant="outline">100%</Badge>
                  </div>
                </div>
              </div>
            </div>
          </Card>
        )}

        <div className="m-2 flex flex-1 flex-col overflow-hidden rounded-md border border-border bg-card">
          {renderContent ? (
            renderContent(currentUrl, activeTab?.isLoading ?? false)
          ) : currentUrl === "about:blank" || currentUrl === "" ? (
            <div className="flex flex-1 items-center justify-center">
              <div className="space-y-4 text-center">
                <Search className="mx-auto size-16 text-muted-foreground" />
                <h2 className="text-2xl font-semibold">New Tab</h2>
                <p className="text-muted-foreground">
                  Start by searching or entering a web address
                </p>
                <div className="mt-8 grid grid-cols-2 gap-4">
                  {bookmarks.slice(0, 4).map((b) => (
                    <Card
                      key={b.id}
                      onClick={() => navigateToUrl(b.url)}
                      className="cursor-pointer p-4 transition-colors hover:bg-muted/50"
                    >
                      <div className="space-y-2 text-center">
                        <div className="text-2xl">{b.favicon}</div>
                        <div className="text-sm font-medium">{b.title}</div>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>
            </div>
          ) : image ? (
            <img
              src={image}
              alt={currentUrl}
              className="h-full w-full rounded-md object-cover"
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
              {currentUrl}
            </div>
          )}
        </div>
      </div>

      {showStatusBar && (
        <div className="flex items-center justify-between border-t border-border bg-muted/30 px-4 py-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-4">
            <span>Ready</span>
            {isSecure && (
              <span className="flex items-center gap-1">
                <Lock className="size-3" /> Secure
              </span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span>Zoom: 100%</span>
            <span>
              {tabs.length} tab{tabs.length !== 1 ? "s" : ""}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}

export { Browser }
export type {
  BrowserProps,
  Tab as BrowserTab,
  Bookmark as BrowserBookmark,
  HistoryItem as BrowserHistoryItem,
}
