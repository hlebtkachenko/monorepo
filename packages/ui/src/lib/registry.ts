type SourceType = "vanilla" | "import" | "custom"

type ComponentMeta = {
  source: string
  sourceType: SourceType
  upstream?: string
  description: string
  categories: string[]
  dependencies?: string[]
  packages?: string[]
}

export const registry: Record<string, ComponentMeta> = {
  "app-shell": {
    source: "src/blocks/app-shell",
    sourceType: "custom",
    description:
      "Block — plane-style app shell (header + left rail + sidebar + body + optional right assistant) used by apps/web/app/[orgSlug], apps/web/app/workspace, and (later) apps/admin. Outer surface uses bg-canvas; an outer ResizablePanelGroup splits the content into a main card (sidebar + body sharing one rounded SHELL_CARD_CLASS card, divided by a plain pointer-drag separator) and a separate assistant card across the group's only ResizableHandle, with a real gap. Geometry only — slots are provided by the consumer. Also exposes ShellSkeleton (loading.tsx) and ErrorShell (error.tsx / not-found.tsx).",
    categories: ["block", "layout", "app"],
    dependencies: ["button", "resizable", "skeleton"],
  },
  "app-header": {
    source: "src/blocks/app-header",
    sourceType: "custom",
    description:
      "Block — presentational top bar for the AppShell header slot. Renders a screen-centered responsive search input plus a right-side `actions` ReactNode slot; the surface (org, admin, …) composes its own action cluster from shared primitives (IconButton, DropdownMenu, …). No product content lives in the block. Search glyph resolves from the active IconProvider pack.",
    categories: ["block", "navigation", "app"],
    dependencies: ["input"],
  },
  "app-rail": {
    source: "src/blocks/app-rail",
    sourceType: "custom",
    description:
      "Block — navigation list for the AppShell rail slot. Renders icon+label items in two modes (expanded / icon-only) toggled via right-click ContextMenu (RadioGroup). Mode persisted to localStorage. Writes `--shell-rail-width` on document root so AppShell rail/header/content animate width when mode changes.",
    categories: ["block", "navigation", "app"],
    dependencies: ["context-menu"],
  },
  "icon-button": {
    source: "src/components/icon-button",
    sourceType: "custom",
    description:
      "Component — standardized clickable icon tile, the single source for the icon-box look (rail, header, …). Icon-only (size-8 square) or icon+label (rectangle with the glyph↔label gap baked in via --icon-label-gap). Whole element is the click target: <button>, <a> via href, or any element via asChild. State colors from the generic --icon* tokens (idle text-icon, hover bg-icon-hover-bg, active text-icon-active + bg-icon-active-bg). Optional tooltip with side + sideOffset (exact gap / safe-zone). Glyph resolves from the active IconProvider pack.",
    categories: ["component", "navigation", "app"],
    dependencies: ["tooltip"],
  },
  "auth-shell": {
    source: "src/blocks/auth-shell",
    sourceType: "custom",
    description:
      "Block — split-grid layout used by every auth + onboarding screen — 2fr form column + 3fr aside column, with header/body/footer sub-slots. Composes Button, Link slot.",
    categories: ["block", "layout", "auth"],
    dependencies: ["button"],
  },
  "auth-forms": {
    source: "src/blocks/auth",
    sourceType: "custom",
    description:
      "Block — shared login / forgot-password / reset-password form components (LoginEmailForm, LoginPasswordForm, LoginMfaForm, ForgotPasswordForm, ResetPasswordForm) plus AuthHeaderLinkProvider / AuthHeaderLinkOverride context. Accepts translated message-map props for i18n; afterSignInGate prop threads the admin allowlist check without coupling the block to Next.js. Composes Field, Heading, Input, PasswordInput, PasswordChecklist, Checkbox, InputOTP, Button, Text.",
    categories: ["block", "auth", "forms"],
    dependencies: [
      "button",
      "checkbox",
      "field",
      "heading",
      "input",
      "input-otp",
      "password-checklist",
      "password-input",
      "text",
      "tooltip",
    ],
    packages: ["@workspace/shared", "react-hook-form", "@hookform/resolvers"],
  },
  "auth-aside": {
    source: "src/blocks/auth-aside",
    sourceType: "custom",
    description:
      "Block — right-panel decorative aside with photo / dark / tone variants, headline + subtitle + quote + animated logo marquee slots, prefers-reduced-data fallback. Composes Marquee.",
    categories: ["block", "layout", "auth"],
    dependencies: ["marquee"],
  },
  "password-input": {
    source: "custom",
    sourceType: "custom",
    description:
      "Password input with show/hide toggle and optional generate button (16-char crypto-random charset). Uncontrolled toggle, controlled value, forwardRef-compatible with react-hook-form",
    categories: ["auth", "forms"],
    dependencies: ["input", "input-group", "tooltip"],
  },
  "password-checklist": {
    source: "custom",
    sourceType: "custom",
    description:
      "Live password validation widget — 2-column grid, evaluates against PASSWORD_RULES from @workspace/shared/auth, aria-live polite announcements",
    categories: ["auth", "forms"],
    dependencies: [],
    packages: ["@workspace/shared"],
  },
  "choice-card": {
    source: "custom",
    sourceType: "custom",
    description:
      "Selectable card with icon + title + description + checkmark, used inside RadioGroup for experience / use-case picker steps. Includes ChoiceCardGrid layout helper",
    categories: ["forms", "auth"],
    dependencies: ["radio-group"],
  },
  "plan-card": {
    source: "custom",
    sourceType: "custom",
    description:
      "Pricing tier row with radio + name + optional badge + features list + price block, used inside RadioGroup for billing plan picker",
    categories: ["forms", "auth"],
    dependencies: ["badge", "radio-group"],
  },
  "invite-row": {
    source: "custom",
    sourceType: "custom",
    description:
      "Dynamic-list row: email input + role select + remove icon button. Includes InviteRowAddButton for appending. Stack on mobile",
    categories: ["forms", "auth"],
    dependencies: ["button", "input", "select"],
  },
  accordion: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/accordion",
    description: "Vertically stacked expandable sections",
    categories: ["disclosure"],
  },
  "action-bar": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/action-bar",
    description:
      "Floating toolbar with keyboard navigation, appearing on selection",
    categories: ["actions", "overlay"],
    dependencies: ["button"],
  },
  alert: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/alert",
    description:
      "Semantic alert container with default and destructive variants",
    categories: ["feedback"],
  },
  "api-response-viewer": {
    source: "tryelements",
    sourceType: "import",
    upstream: "https://www.tryelements.dev/docs/devtools/api-response-viewer",
    description:
      "Tabbed HTTP response inspector with semantic status badge, JSON body, headers table, and timing waterfall",
    categories: ["data", "display"],
    dependencies: ["button", "json-viewer", "tabs"],
  },
  "alert-dialog": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/alert-dialog",
    description:
      "Modal dialog for confirmations with cancel and continue actions",
    categories: ["overlay"],
    dependencies: ["button"],
  },
  "aspect-ratio": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/aspect-ratio",
    description: "Container enforcing a fixed aspect ratio",
    categories: ["layout"],
  },
  autocomplete: {
    source: "coss",
    sourceType: "import",
    upstream: "https://coss.com/ui/docs/components/autocomplete",
    description:
      "Inline-autofill input with async search, groups, clear button, and optional trigger toggle",
    categories: ["forms"],
    dependencies: ["scroll-area"],
    packages: ["@base-ui/react"],
  },
  avatar: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/avatar",
    description: "User avatar with image, fallback text, and group support",
    categories: ["display"],
  },
  badge: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/badge",
    description:
      "Small label with default, secondary, outline, and destructive variants",
    categories: ["display"],
  },
  banner: {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/banner",
    description:
      "Dismissible notification banner with info/success/warning/destructive variants and optional queue manager",
    categories: ["feedback"],
    dependencies: ["button"],
  },
  "border-beam": {
    source: "border-beam",
    sourceType: "import",
    upstream: "https://www.npmjs.com/package/border-beam",
    description:
      "Generic wrapper that traces an animated beam border around its children, with size, color variant, theme, and timing controls",
    categories: ["effects"],
    packages: ["border-beam"],
  },
  breadcrumb: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/breadcrumb",
    description: "Navigation breadcrumb trail with separators",
    categories: ["navigation"],
  },
  browser: {
    source: "eldoraui",
    sourceType: "import",
    upstream: "https://www.eldoraui.site/docs/components/browser",
    description:
      "Browser simulator chrome with address bar, tabs, bookmarks, history, downloads, and settings",
    categories: ["display"],
    dependencies: ["badge", "button", "card", "input", "separator"],
  },
  "button-border-beam": {
    source: "cult-ui",
    sourceType: "import",
    upstream: "https://www.cult-ui.com/docs/components/border-beam-button",
    description: "Button wrapped with animated beam border effect",
    categories: ["actions", "effects"],
    dependencies: ["button"],
    packages: ["border-beam"],
  },
  button: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/button",
    description: "Core button with variants, sizes, and icon support",
    categories: ["actions"],
  },
  "button-group": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/button-group",
    description: "Container for visually grouped buttons",
    categories: ["actions", "layout"],
    dependencies: ["separator"],
  },
  "button-liquid-metal": {
    source: "jolyui",
    sourceType: "import",
    upstream:
      "https://www.jolyui.dev/docs/components/buttons/liquid-metal-button",
    description:
      "WebGL shader-powered button with 3D metallic liquid animation and ripple effects",
    categories: ["actions", "effects"],
    packages: ["@paper-design/shaders"],
  },
  calendar: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/calendar",
    description: "Date picker calendar with day selection",
    categories: ["forms"],
    dependencies: ["button"],
    packages: ["react-day-picker"],
  },
  card: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/card",
    description:
      "Container for grouped content with header, content, and footer",
    categories: ["layout"],
  },
  "card-extended": {
    source: "cardcn",
    sourceType: "import",
    upstream: "https://cardcn.dev/cards/basic-cards/",
    description:
      "Card with decorative variants: shadow, lines, hatched, aurora, tilted, stacked",
    categories: ["display", "layout"],
    dependencies: ["card"],
  },
  carousel: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/carousel",
    description: "Scrollable content carousel with navigation controls",
    categories: ["display"],
    dependencies: ["button"],
    packages: ["embla-carousel-react"],
  },
  "circular-progress": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/circular-progress",
    description:
      "SVG circular progress indicator with track + range, indeterminate state, configurable size and thickness",
    categories: ["feedback", "display"],
  },
  chart: {
    source: "shadcn+evilcharts",
    sourceType: "custom",
    upstream: "https://ui.shadcn.com/docs/components/chart",
    description:
      "Unified chart component dispatched by type: area, bar/column, line, composed, pie, donut, radar, category-bar, and spark-area/spark-line/spark-bar (axis-less mini charts). ChartContainer/Tooltip/Legend exported for custom recharts compositions.",
    categories: ["data"],
    packages: ["recharts"],
  },
  checkbox: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/checkbox",
    description: "Toggle checkbox input with checked and indeterminate states",
    categories: ["forms"],
  },
  collapsible: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/collapsible",
    description: "Expandable and collapsible content section",
    categories: ["disclosure"],
  },
  "color-picker": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/color-picker",
    description:
      "HSL color area picker with hue slider, hex/HSL input, and preset swatches inside a popover",
    categories: ["forms"],
    dependencies: ["button", "input", "label", "popover"],
  },
  "color-swatch": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/color-swatch",
    description:
      "Color preview swatch with sm/default/lg sizes, transparency checker, and asChild support",
    categories: ["display"],
  },
  "commit-graph": {
    source: "justinlevine",
    sourceType: "import",
    upstream: "https://ui.justinlevine.me/docs/components/commit-graph",
    description:
      "Topological git graph with SVG rail lines, branch forks, merges, and commit popovers",
    categories: ["display", "data"],
  },
  combobox: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/combobox",
    description: "Searchable dropdown with autocomplete",
    categories: ["forms"],
    dependencies: ["button", "input-group"],
    packages: ["@base-ui/react"],
  },
  command: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/command",
    description: "Command palette with keyboard navigation and search",
    categories: ["overlay", "navigation"],
    dependencies: ["dialog", "input-group"],
    packages: ["cmdk"],
  },
  "context-menu": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/context-menu",
    description: "Right-click context menu with items and submenus",
    categories: ["overlay"],
  },
  "creatable-combobox": {
    source: "flowkit-ui",
    sourceType: "import",
    upstream:
      "https://flowkit-ui.vzkiss.com/docs/components/creatable-combobox",
    description:
      "Combobox extension with autocomplete + dynamic item creation, built on our Combobox primitive",
    categories: ["forms"],
    dependencies: ["combobox"],
  },
  "data-track": {
    source: "tremor",
    sourceType: "custom",
    upstream: "https://www.tremor.so/docs/visualizations/bar-list",
    description:
      "Compact data visualization with two variants: list (ranked labelled bars) and tracker (status-block timeline)",
    categories: ["data"],
    dependencies: ["tooltip"],
  },
  "data-grid": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/data-grid",
    description:
      "Virtualized editable grid with 9 cell types, clipboard, undo/redo, search, sorting, and column management",
    categories: ["data"],
    dependencies: [
      "button",
      "checkbox",
      "command",
      "dialog",
      "input",
      "popover",
      "select",
      "table",
    ],
    packages: ["@tanstack/react-table", "@tanstack/react-virtual"],
  },
  "data-table": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/data-table",
    description:
      "Feature-rich TanStack table with filtering, multi-column sort, pagination, column visibility, row selection, action bar, and router-agnostic URL state",
    categories: ["data"],
    dependencies: [
      "badge",
      "button",
      "calendar",
      "checkbox",
      "command",
      "dialog",
      "dropdown-menu",
      "input",
      "popover",
      "select",
      "separator",
      "skeleton",
      "slider",
      "table",
      "tooltip",
    ],
    packages: ["@tanstack/react-table"],
  },
  dialog: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/dialog",
    description: "Modal dialog overlay with title, description, and actions",
    categories: ["overlay"],
    dependencies: ["button"],
  },
  direction: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/direction",
    description: "RTL/LTR direction provider wrapper",
    categories: ["layout"],
  },
  "download-trigger": {
    source: "ark-ui",
    sourceType: "import",
    upstream: "https://ark-ui.com/react/docs/utilities/download-trigger",
    description:
      "Programmatic file download utility supporting string, Blob, File, and async data",
    categories: ["utility"],
    packages: ["@ark-ui/react"],
  },
  drawer: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/drawer",
    description: "Slide-out drawer panel from screen edge",
    categories: ["overlay"],
    packages: ["vaul"],
  },
  "dropdown-menu": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/dropdown-menu",
    description: "Dropdown menu with items, separators, and keyboard shortcuts",
    categories: ["overlay"],
  },
  empty: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/empty",
    description: "Empty state display with icon, title, and description",
    categories: ["feedback"],
  },
  "env-editor": {
    source: "tryelements",
    sourceType: "import",
    upstream: "https://www.tryelements.dev/docs/devtools/env-editor",
    description:
      "Key-value editor for environment variables with masked values, add/remove rows, and .env import/export",
    categories: ["forms", "data"],
    dependencies: ["button", "input"],
  },
  "error-boundary-ui": {
    source: "tryelements",
    sourceType: "import",
    upstream: "https://www.tryelements.dev/docs/devtools/error-boundary-ui",
    description:
      "Error fallback display with stack trace parsing, copy-to-clipboard, retry, and dev/prod verbosity modes",
    categories: ["feedback"],
    dependencies: ["button"],
  },
  field: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/field",
    description:
      "Form field wrapper with label, description, and error message",
    categories: ["forms"],
    dependencies: ["label", "separator"],
  },
  "file-upload": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/file-upload",
    description:
      "Drag-and-drop file upload with progress tracking, type/size validation, and preview thumbnails",
    categories: ["forms"],
    dependencies: ["button"],
  },
  "filter-bar": {
    source: "bazza",
    sourceType: "import",
    upstream: "https://ui.bazza.dev/docs/data-table-filter",
    description:
      "Library-agnostic table filter bar with pill chips, operator selection, debounced inputs, and pluggable strings override",
    categories: ["data", "forms"],
    dependencies: [
      "badge",
      "button",
      "calendar",
      "checkbox",
      "command",
      "input",
      "popover",
      "select",
      "slider",
    ],
    packages: ["date-fns", "react-day-picker"],
  },
  "floating-panel": {
    source: "shark-ui",
    sourceType: "import",
    upstream: "https://shark.vini.one/docs/components/floating-panel",
    description:
      "Non-modal floating window with drag, resize, minimize, maximize, and restore controls",
    categories: ["overlay"],
    dependencies: ["button", "scroll-area"],
    packages: ["@ark-ui/react"],
  },
  gauge: {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/gauge",
    description:
      "SVG gauge/meter with configurable min/max, thickness, start/end angles, and value text",
    categories: ["display", "feedback"],
  },
  heading: {
    source: "custom",
    sourceType: "custom",
    description:
      "Semantic heading (h1-h4) with shadcn typography scale and font-heading family",
    categories: ["typography"],
  },
  "hover-card": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/hover-card",
    description: "Popup card appearing on hover",
    categories: ["overlay"],
  },
  input: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/input",
    description: "Text input field with focus and disabled states",
    categories: ["forms"],
  },
  "input-group": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/input-group",
    description: "Composite input with addon elements and buttons",
    categories: ["forms"],
    dependencies: ["button", "input", "textarea"],
  },
  "input-otp": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/input-otp",
    description: "One-time password input with segmented fields",
    categories: ["forms"],
    packages: ["input-otp"],
  },
  "input-phone": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/phone-input",
    description:
      "International phone input variation with country selector (Popover + Command), flag, and tel formatting",
    categories: ["forms"],
    dependencies: ["button", "command", "input", "popover"],
  },
  "input-segmented": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/segmented-input",
    description:
      "Multi-segment input (date, time, code) with per-segment focus, keyboard navigation, and validation",
    categories: ["forms"],
    dependencies: ["input"],
  },
  "input-tags": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/tags-input",
    description:
      "Tag/chip input with keyboard add, editable items, paste support, and clear button",
    categories: ["forms"],
    packages: ["@diceui/tags-input"],
  },
  item: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/item",
    description: "List item with media, content, description, and actions",
    categories: ["display", "layout"],
    dependencies: ["separator"],
  },
  "json-viewer": {
    source: "tryelements",
    sourceType: "import",
    upstream: "https://www.tryelements.dev/docs/devtools/json-viewer",
    description:
      "Collapsible JSON tree with chart-token syntax highlighting, search filter, and copy-path-on-hover",
    categories: ["data", "display"],
    dependencies: ["button", "input"],
  },
  kbd: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/kbd",
    description: "Keyboard key display for shortcuts",
    categories: ["display"],
  },
  "key-value": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/key-value",
    description:
      "Generic editable key-value pair input with paste-parsing, validation, duplicate detection, and reorder",
    categories: ["display", "forms"],
    dependencies: ["button", "input", "textarea"],
  },
  marquee: {
    source: "magicui",
    sourceType: "import",
    upstream: "https://magicui.design/docs/components/marquee",
    description:
      "Horizontal or vertical scrolling marquee with pause-on-hover, reverse, and configurable speed",
    categories: ["effects"],
  },
  mention: {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/mention",
    description:
      "Text input with @mention autocomplete suggestions triggered by a configurable character",
    categories: ["forms"],
    packages: ["@diceui/mention"],
  },
  "multi-step-loader": {
    source: "aceternity",
    sourceType: "import",
    upstream: "https://ui.aceternity.com/components/multi-step-loader",
    description:
      "Full-screen overlay that cycles through ordered loading states with check animations",
    categories: ["feedback", "effects"],
    packages: ["motion"],
  },
  "image-cropper": {
    source: "custom",
    sourceType: "custom",
    description:
      "Avatar crop modal — circular or rectangular 1:1 crop overlay with zoom slider, Reset / Cancel / Save actions, outputs a square cropped image as a Blob via canvas. Composes Dialog, Slider, Button",
    categories: ["forms", "overlay"],
    dependencies: ["dialog", "slider", "button"],
    packages: ["react-easy-crop"],
  },
  "noise-background": {
    source: "aceternity",
    sourceType: "import",
    upstream: "https://ui.aceternity.com/components/noise-background",
    description:
      "Animated gradient backdrop with SVG turbulence noise overlay, semantic-token defaults, optional backdrop blur",
    categories: ["effects", "display"],
    packages: ["motion"],
  },
  label: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/label",
    description: "Form label element",
    categories: ["forms"],
  },
  menubar: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/menubar",
    description: "Horizontal menu bar with dropdown submenus",
    categories: ["navigation"],
  },
  "native-select": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/native-select",
    description: "Native HTML select with custom styling",
    categories: ["forms"],
  },
  "navigation-bottom-mobile": {
    source: "shark-ui",
    sourceType: "import",
    upstream: "https://shark.vini.one/docs/components/bottom-navigation",
    description:
      "Mobile-first bottom navigation bar with icon and label items, fixed positioning, and safe-area support",
    categories: ["navigation"],
    packages: ["@ark-ui/react"],
  },
  "navigation-menu": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/navigation-menu",
    description: "Horizontal navigation with dropdown content panels",
    categories: ["navigation"],
  },
  pagination: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/pagination",
    description: "Page navigation with previous, next, and numbered links",
    categories: ["navigation"],
    dependencies: ["button"],
  },
  "pdf-utils": {
    source: "tryelements",
    sourceType: "import",
    upstream: "https://www.tryelements.dev/docs/pdf/pdf-utils",
    description:
      "Client-side PDF utility library: extract metadata, screenshot pages, search text, generate thumbnails, split page ranges",
    categories: ["data", "utility"],
    packages: ["pdf-lib", "pdfjs-dist", "react-pdf"],
  },
  "pdf-viewer": {
    source: "tryelements",
    sourceType: "import",
    upstream: "https://www.tryelements.dev/docs/pdf/pdf-viewer",
    description:
      "Full-featured PDF viewer with single-page, continuous-scroll, and book layout modes, zoom controls, and page navigation",
    categories: ["display"],
    dependencies: ["button", "input"],
    packages: ["react-pdf"],
  },
  popover: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/popover",
    description: "Positioned popover triggered by a button or element",
    categories: ["overlay"],
  },
  progress: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/progress",
    description: "Linear progress bar indicator",
    categories: ["feedback"],
  },
  "prompt-library": {
    source: "cult-ui",
    sourceType: "import",
    upstream: "https://www.cult-ui.com/docs/components/prompt-library",
    description:
      "AI prompt template library in a popover with search, categories, hover preview, and custom prompt creation",
    categories: ["overlay", "forms"],
    dependencies: [
      "button",
      "command",
      "dialog",
      "hover-card",
      "input",
      "popover",
      "textarea",
    ],
    packages: ["cmdk", "@hugeicons/react", "@hugeicons/core-free-icons"],
  },
  "qr-code": {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/qr-code",
    description:
      "QR code generator with configurable size, error correction level, optional logo overlay, and PNG/SVG download",
    categories: ["display"],
    packages: ["qrcode"],
  },
  "radio-group": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/radio-group",
    description: "Radio button group for single selection",
    categories: ["forms"],
  },
  resizable: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/resizable",
    description: "Resizable panel layout with drag handles",
    categories: ["layout"],
    packages: ["react-resizable-panels"],
  },
  "ring-loader": {
    source: "loading-ui",
    sourceType: "import",
    upstream: "https://loading-ui.com",
    description:
      "Lightweight SVG spinning ring indicator with currentColor and --duration override",
    categories: ["feedback"],
  },
  "scroll-area": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/scroll-area",
    description: "Custom scrollbar wrapper with smooth scrolling",
    categories: ["layout"],
  },
  select: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/select",
    description: "Styled dropdown select with search and keyboard support",
    categories: ["forms"],
  },
  separator: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/separator",
    description:
      "Visual divider with solid (default), dashed, dotted, and double variants in horizontal and vertical orientations",
    categories: ["layout"],
  },
  sheet: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/sheet",
    description: "Side panel sliding in from any screen edge",
    categories: ["overlay"],
    dependencies: ["button"],
  },
  sidebar: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/sidebar",
    description: "Collapsible layout sidebar with mobile support",
    categories: ["navigation", "layout"],
    dependencies: [
      "button",
      "input",
      "separator",
      "sheet",
      "skeleton",
      "tooltip",
    ],
    packages: ["next-themes"],
  },
  "signature-pad": {
    source: "ark-ui",
    sourceType: "import",
    upstream: "https://shark.vini.one/docs/components/signature-pad",
    description:
      "Canvas-based hand-drawn signature capture with clear button, guide line, and image export",
    categories: ["forms"],
    dependencies: ["button"],
    packages: ["@ark-ui/react"],
  },
  skeleton: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/skeleton",
    description: "Animated placeholder for loading content",
    categories: ["feedback"],
  },
  slider: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/slider",
    description: "Range slider with draggable thumb",
    categories: ["forms"],
  },
  "snail-timer": {
    source: "uicapsule",
    sourceType: "import",
    upstream: "https://www.uicapsule.com",
    description:
      "Animated countdown timer with a token-themed snail traversing the container, configurable initial seconds",
    categories: ["feedback"],
  },
  sonner: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/sonner",
    description: "Toast notification system",
    categories: ["feedback"],
    packages: ["sonner", "next-themes"],
  },
  "stateful-button": {
    source: "aceternity",
    sourceType: "import",
    upstream: "https://ui.aceternity.com/components/stateful-button",
    description:
      "Hook providing loading/success/error state machine for async button actions",
    categories: ["utility", "actions"],
  },
  spinner: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/spinner",
    description: "Animated loading spinner",
    categories: ["feedback"],
  },
  swap: {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/swap",
    description:
      "Animated toggle between two content states with fade, rotate, flip, and scale transitions",
    categories: ["actions", "effects"],
  },
  switch: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/switch",
    description: "Toggle switch for on/off states",
    categories: ["forms"],
  },
  table: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/table",
    description: "Data table with header, body, footer, and caption",
    categories: ["data"],
  },
  tabs: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/tabs",
    description: "Tabbed interface with content panels",
    categories: ["navigation"],
  },
  text: {
    source: "custom",
    sourceType: "custom",
    description:
      "Body text with default, lead, large, small, muted, blockquote, and inline-code variants",
    categories: ["typography"],
  },
  textarea: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/textarea",
    description: "Multi-line text input field",
    categories: ["forms"],
  },
  "theme-provider": {
    source: "custom",
    sourceType: "custom",
    description:
      "Dark/light mode provider with color theme context and keyboard shortcut",
    categories: ["utility"],
    packages: ["next-themes"],
  },
  "theme-toggle": {
    source: "custom",
    sourceType: "custom",
    description: "Combined dark/light and color theme toggle controls",
    categories: ["actions"],
    dependencies: ["button", "dropdown-menu", "theme-provider"],
  },
  timeline: {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/timeline",
    description:
      "Vertical/horizontal timeline with active step tracking, connector lines, dot status, and optional alternate layout",
    categories: ["display"],
  },
  toggle: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/toggle",
    description: "Stateful toggle button with pressed/unpressed state",
    categories: ["actions"],
  },
  "toggle-group": {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/toggle-group",
    description: "Group of mutually exclusive toggle buttons",
    categories: ["actions"],
    dependencies: ["toggle"],
  },
  tooltip: {
    source: "shadcn",
    sourceType: "vanilla",
    upstream: "https://ui.shadcn.com/docs/components/tooltip",
    description: "Hover tooltip with text content",
    categories: ["overlay"],
  },
  tour: {
    source: "diceui",
    sourceType: "import",
    upstream: "https://www.diceui.com/docs/components/radix/tour",
    description:
      "Multi-step guided tour overlay with spotlight, floating tooltip, step navigation, and keyboard support",
    categories: ["overlay", "navigation"],
    dependencies: ["button"],
    packages: ["@floating-ui/react-dom"],
  },
  "webhook-tester": {
    source: "tryelements",
    sourceType: "import",
    upstream: "https://www.tryelements.dev/docs/devtools/webhook-tester",
    description:
      "HTTP request builder with method selector, header editor, JSON body, and semantic-colored response. Requires caller-supplied onSend handler (no built-in fetch).",
    categories: ["forms", "data"],
    dependencies: ["button", "input", "native-select", "textarea"],
  },
}

export type { ComponentMeta, SourceType }
