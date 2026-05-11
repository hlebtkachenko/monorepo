import { ThemeToggle } from "@/components/theme-toggle"
import { ScrollToTop } from "./_components/scroll-to-top"
import { AlertCircle, Inbox, Search } from "lucide-react"

import {
  Alert,
  AlertDescription,
  AlertTitle,
} from "@workspace/ui/components/alert"
import { AspectRatio } from "@workspace/ui/components/aspect-ratio"
import {
  Avatar,
  AvatarFallback,
  AvatarGroup,
  AvatarGroupCount,
  AvatarImage,
} from "@workspace/ui/components/avatar"
import { Badge } from "@workspace/ui/components/badge"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@workspace/ui/components/breadcrumb"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@workspace/ui/components/empty"
import { Kbd, KbdGroup } from "@workspace/ui/components/kbd"
import { Label } from "@workspace/ui/components/label"
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@workspace/ui/components/pagination"
import { Progress } from "@workspace/ui/components/progress"
import { Separator } from "@workspace/ui/components/separator"
import { Skeleton } from "@workspace/ui/components/skeleton"
import { Spinner } from "@workspace/ui/components/spinner"
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { ChevronRight, Loader2, Mail, Plus, Trash2 } from "lucide-react"

import { Input } from "@workspace/ui/components/input"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  NativeSelect,
  NativeSelectOption,
} from "@workspace/ui/components/native-select"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"
import {
  Field,
  FieldDescription,
  FieldError,
  FieldLabel,
} from "@workspace/ui/components/field"
import {
  ButtonGroup,
  ButtonGroupSeparator,
  ButtonGroupText,
} from "@workspace/ui/components/button-group"

import { CheckboxDemo } from "./_components/checkbox-demo"
import { SwitchDemo } from "./_components/switch-demo"
import { RadioGroupDemo } from "./_components/radio-group-demo"
import { SelectDemo } from "./_components/select-demo"
import { SliderDemo } from "./_components/slider-demo"
import { InputOTPDemo } from "./_components/input-otp-demo"
import { DialogDemo } from "./_components/dialog-demo"
import { AlertDialogDemo } from "./_components/alert-dialog-demo"
import { SheetDemo } from "./_components/sheet-demo"
import { DrawerDemo } from "./_components/drawer-demo"
import { PopoverDemo } from "./_components/popover-demo"
import { HoverCardDemo } from "./_components/hover-card-demo"
import { TooltipDemo } from "./_components/tooltip-demo"
import { DropdownMenuDemo } from "./_components/dropdown-menu-demo"
import { ContextMenuDemo } from "./_components/context-menu-demo"

import {
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
} from "@workspace/ui/components/tabs"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@workspace/ui/components/accordion"
import {
  NavigationMenu,
  NavigationMenuList,
  NavigationMenuItem,
  NavigationMenuTrigger,
  NavigationMenuContent,
  NavigationMenuLink,
} from "@workspace/ui/components/navigation-menu"
import {
  Menubar,
  MenubarMenu,
  MenubarTrigger,
  MenubarContent,
  MenubarItem,
  MenubarSeparator,
  MenubarShortcut,
} from "@workspace/ui/components/menubar"
import { ScrollArea } from "@workspace/ui/components/scroll-area"
import {
  Item,
  ItemMedia,
  ItemContent,
  ItemTitle,
  ItemDescription,
  ItemActions,
  ItemGroup,
} from "@workspace/ui/components/item"
import { FileText } from "lucide-react"

import { CollapsibleDemo } from "./_components/collapsible-demo"
import { ResizableDemo } from "./_components/resizable-demo"
import { ComboboxDemo } from "./_components/combobox-demo"
import { CommandDemo } from "./_components/command-demo"
import { CalendarDemo } from "./_components/calendar-demo"
import { CarouselDemo } from "./_components/carousel-demo"
import {
  ChartAreaGradient,
  ChartAreaSolid,
  ChartAreaStacked,
  ChartAreaDashed,
  ChartColumn,
  ChartColumnStacked,
  ChartColumnGradient,
  ChartBarHorizontal,
  ChartLineDefault,
  ChartLineWithDots,
  ChartLineDashed,
  ChartLineStepped,
  ChartComposedBarLine,
  ChartComposedAreaBar,
  ChartPie,
  ChartDonut,
  ChartRadarFilled,
  ChartRadarLines,
} from "./_components/chart-demo"
import { ToggleDemo } from "./_components/toggle-demo"
import { ToggleGroupDemo } from "./_components/toggle-group-demo"
import { SonnerDemo } from "./_components/sonner-demo"
import { ActionBarDemo } from "./_components/action-bar-demo"
import { Swap, SwapOff, SwapOn } from "@workspace/ui/components/swap"
import { MoonIcon, SunIcon, Volume2Icon, VolumeOffIcon } from "lucide-react"
import { BorderBeamDemo } from "./_components/border-beam-demo"
import { LiquidMetalDemo } from "./_components/liquid-metal-demo"
import { StatefulButtonDemo } from "./_components/stateful-button-demo"
import { ApiResponseViewerDemo } from "./_components/api-response-viewer-demo"
import { EnvEditorDemo } from "./_components/env-editor-demo"
import { ErrorBoundaryUiDemo } from "./_components/error-boundary-ui-demo"
import { JsonViewerDemo } from "./_components/json-viewer-demo"
import { WebhookTesterDemo } from "./_components/webhook-tester-demo"
import { BrowserDemo } from "./_components/browser-demo"
import { CardExtendedDemo } from "./_components/card-extended-demo"
import { CommitGraphDemo } from "./_components/commit-graph-demo"
import { GaugeDemo } from "./_components/gauge-demo"
import { KeyValueDemo } from "./_components/key-value-demo"
import { QRCodeDemo } from "./_components/qr-code-demo"
import { ColorSwatch } from "@workspace/ui/components/color-swatch"
import { BannerDemo } from "./_components/banner-demo"
import { CircularProgressDemo } from "./_components/circular-progress-demo"
import { MarqueeDemo } from "./_components/marquee-demo"
import { MultiStepLoaderDemo } from "./_components/multi-step-loader-demo"
import { NoiseBackgroundDemo } from "./_components/noise-background-demo"
import { RingLoaderDemo } from "./_components/ring-loader-demo"
import { SnailTimerDemo } from "./_components/snail-timer-demo"
import { TimelineDemo } from "./_components/timeline-demo"
import { AutocompleteDemo } from "./_components/autocomplete-demo"
import { ColorPickerDemo } from "./_components/color-picker-demo"
import { CreatableComboboxDemo } from "./_components/creatable-combobox-demo"
import { FileUploadDemo } from "./_components/file-upload-demo"
import { InputPhoneDemo } from "./_components/input-phone-demo"
import { MentionDemo } from "./_components/mention-demo"
import { InputSegmentedDemo } from "./_components/input-segmented-demo"
import { SignaturePadDemo } from "./_components/signature-pad-demo"
import { InputTagsDemo } from "./_components/input-tags-demo"
import { NavigationBottomMobileDemo } from "./_components/navigation-bottom-mobile-demo"
import { DataGridDemo } from "./_components/data-grid-demo"
import { DataTableDemo } from "./_components/data-table-demo"
import { FilterBarDemo } from "./_components/filter-bar-demo"
import { FloatingPanelDemo } from "./_components/floating-panel-demo"
import { PdfViewerDemo } from "./_components/pdf-viewer-demo"
import { PromptLibraryDemo } from "./_components/prompt-library-demo"
import { TourDemo } from "./_components/tour-demo"
import { SidebarDemo } from "./_components/sidebar-demo"

export default function ShowcasePage() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-12 flex items-center justify-between">
        <h1 className="text-4xl font-bold">Component Showcase</h1>
        <ThemeToggle />
      </div>

      {/* ==================== ACCORDION ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Accordion</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              FAQ style
            </h3>
            <Accordion type="single" collapsible className="max-w-md">
              <AccordionItem value="item-1">
                <AccordionTrigger>How does billing work?</AccordionTrigger>
                <AccordionContent>
                  Billing is monthly and based on your selected plan. You can
                  upgrade or downgrade at any time.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-2">
                <AccordionTrigger>Can I cancel anytime?</AccordionTrigger>
                <AccordionContent>
                  Yes, you can cancel your subscription at any time. Your access
                  continues until the end of the billing period.
                </AccordionContent>
              </AccordionItem>
              <AccordionItem value="item-3">
                <AccordionTrigger>Is there a free trial?</AccordionTrigger>
                <AccordionContent>
                  We offer a 14-day free trial with full access to all features.
                  No credit card required.
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          </div>
        </div>
      </section>

      {/* ==================== ACTIONBAR ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">ActionBar</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Selection toolbar
            </h3>
            <ActionBarDemo />
          </div>
        </div>
      </section>

      {/* ==================== ALERT ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Alert</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Variants
            </h3>
            <div className="flex flex-col gap-3">
              <Alert variant="default">
                <AlertTitle>Heads up</AlertTitle>
                <AlertDescription>
                  Your subscription renews in 3 days. Update your payment method
                  if needed.
                </AlertDescription>
              </Alert>
              <Alert variant="destructive">
                <AlertCircle />
                <AlertTitle>Deployment failed</AlertTitle>
                <AlertDescription>
                  Build error on step 4. Check the logs for details and retry.
                </AlertDescription>
              </Alert>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== ALERTDIALOG ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          AlertDialog
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Destructive confirmation
            </h3>
            <div className="flex flex-wrap gap-3">
              <AlertDialogDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== APIRESPONSEVIEWER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ApiResponseViewer
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Success + error responses with body, headers, timing tabs
            </h3>
            <ApiResponseViewerDemo />
          </div>
        </div>
      </section>

      {/* ==================== ASPECTRATIO ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          AspectRatio
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              16:9
            </h3>
            <div className="w-64">
              <AspectRatio ratio={16 / 9}>
                <div className="flex size-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                  16 / 9
                </div>
              </AspectRatio>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              1:1
            </h3>
            <div className="w-32">
              <AspectRatio ratio={1}>
                <div className="flex size-full items-center justify-center rounded-lg bg-muted text-sm text-muted-foreground">
                  1 / 1
                </div>
              </AspectRatio>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== AUTOCOMPLETE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          Autocomplete
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Filterable list with clear + search icon
            </h3>
            <AutocompleteDemo />
          </div>
        </div>
      </section>

      {/* ==================== AVATAR ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Avatar</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Sizes
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar size="sm">
                <AvatarImage src="https://github.com/shadcn.png" alt="shadcn" />
                <AvatarFallback>SC</AvatarFallback>
              </Avatar>
              <Avatar size="default">
                <AvatarImage src="https://github.com/shadcn.png" alt="shadcn" />
                <AvatarFallback>SC</AvatarFallback>
              </Avatar>
              <Avatar size="lg">
                <AvatarImage src="https://github.com/shadcn.png" alt="shadcn" />
                <AvatarFallback>SC</AvatarFallback>
              </Avatar>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Text Fallback
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <Avatar>
                <AvatarFallback>HT</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>AB</AvatarFallback>
              </Avatar>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Group
            </h3>
            <AvatarGroup>
              <Avatar>
                <AvatarFallback>HT</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>JD</AvatarFallback>
              </Avatar>
              <Avatar>
                <AvatarFallback>AB</AvatarFallback>
              </Avatar>
              <AvatarGroupCount>+4</AvatarGroupCount>
            </AvatarGroup>
          </div>
        </div>
      </section>

      {/* ==================== BADGE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Badge</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Variants
            </h3>
            <div className="flex flex-wrap gap-3">
              <Badge variant="default">Default</Badge>
              <Badge variant="secondary">Secondary</Badge>
              <Badge variant="outline">Outline</Badge>
              <Badge variant="destructive">Destructive</Badge>
              <Badge variant="ghost">Ghost</Badge>
              <Badge variant="link">Link</Badge>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== BANNER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Banner</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Variants with actions
            </h3>
            <BannerDemo />
          </div>
        </div>
      </section>

      {/* ==================== BREADCRUMB ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          Breadcrumb
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Three levels
            </h3>
            <Breadcrumb>
              <BreadcrumbList>
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Dashboard</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbLink href="#">Projects</BreadcrumbLink>
                </BreadcrumbItem>
                <BreadcrumbSeparator />
                <BreadcrumbItem>
                  <BreadcrumbPage>Agentic Finance</BreadcrumbPage>
                </BreadcrumbItem>
              </BreadcrumbList>
            </Breadcrumb>
          </div>
        </div>
      </section>

      {/* ==================== NAVIGATIONBOTTOMMOBILE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          NavigationBottomMobile
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Mobile tab bar with icons
            </h3>
            <NavigationBottomMobileDemo />
          </div>
        </div>
      </section>

      {/* ==================== BROWSER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Browser</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Chrome with tabs + bookmarks bar
            </h3>
            <BrowserDemo />
          </div>
        </div>
      </section>

      {/* ==================== BUTTONBORDERBEAM ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ButtonBorderBeam
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Variants
            </h3>
            <BorderBeamDemo />
          </div>
        </div>
      </section>

      {/* ==================== BUTTON ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Button</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Variants
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button variant="default">Default</Button>
              <Button variant="secondary">Secondary</Button>
              <Button variant="outline">Outline</Button>
              <Button variant="ghost">Ghost</Button>
              <Button variant="destructive">Destructive</Button>
              <Button variant="link">Link</Button>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Sizes
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <Button size="xs">Extra Small</Button>
              <Button size="sm">Small</Button>
              <Button size="default">Default</Button>
              <Button size="lg">Large</Button>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              With Icons
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button>
                <Mail data-icon="inline-start" />
                Login with Email
              </Button>
              <Button variant="outline">
                Next
                <ChevronRight data-icon="inline-end" />
              </Button>
              <Button variant="destructive">
                <Trash2 data-icon="inline-start" />
                Delete
              </Button>
              <Button size="icon" variant="outline">
                <Plus />
              </Button>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              States
            </h3>
            <div className="flex flex-wrap gap-3">
              <Button disabled>Disabled</Button>
              <Button disabled>
                <Loader2 className="animate-spin" />
                Loading...
              </Button>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== BUTTONGROUP ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ButtonGroup
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Horizontal
            </h3>
            <div className="flex flex-wrap gap-4">
              <ButtonGroup>
                <Button variant="outline">Week</Button>
                <Button variant="outline">Month</Button>
                <Button variant="outline">Year</Button>
              </ButtonGroup>
              <ButtonGroup>
                <Button variant="outline">
                  <Plus />
                </Button>
                <ButtonGroupSeparator />
                <Button variant="outline">Add Item</Button>
              </ButtonGroup>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              With Text Addon
            </h3>
            <ButtonGroup>
              <ButtonGroupText>Sort by</ButtonGroupText>
              <Button variant="outline">Name</Button>
              <Button variant="outline">Date</Button>
              <Button variant="outline">Size</Button>
            </ButtonGroup>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Vertical
            </h3>
            <ButtonGroup orientation="vertical" className="w-32">
              <Button variant="outline">Top</Button>
              <Button variant="outline">Middle</Button>
              <Button variant="outline">Bottom</Button>
            </ButtonGroup>
          </div>
        </div>
      </section>

      {/* ==================== CALENDAR ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Calendar</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Date picker
            </h3>
            <CalendarDemo />
          </div>
        </div>
      </section>

      {/* ==================== CARD ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Card</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Default
            </h3>
            <Card className="max-w-sm">
              <CardHeader>
                <CardTitle>Project Settings</CardTitle>
                <CardDescription>
                  Manage your project configuration.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Configure team access, environment variables, and deployment
                  options.
                </p>
              </CardContent>
              <CardFooter>
                <Button size="sm">Save Changes</Button>
              </CardFooter>
            </Card>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Small
            </h3>
            <Card className="max-w-xs" size="sm">
              <CardHeader>
                <CardTitle>Quick Stats</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  24 active users today
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* ==================== CARDEXTENDED ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          CardExtended
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              6 decorative variants of base Card
            </h3>
            <CardExtendedDemo />
          </div>
        </div>
      </section>

      {/* ==================== CAROUSEL ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Carousel</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              4 slides with prev/next
            </h3>
            <CarouselDemo />
          </div>
        </div>
      </section>

      {/* ==================== CHART ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Chart</h2>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Area — Gradient
            </h3>
            <ChartAreaGradient />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Area — Solid
            </h3>
            <ChartAreaSolid />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Area — Stacked
            </h3>
            <ChartAreaStacked />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Area — Dashed stroke
            </h3>
            <ChartAreaDashed />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Column
            </h3>
            <ChartColumn />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Column — Stacked
            </h3>
            <ChartColumnStacked />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Column — Gradient
            </h3>
            <ChartColumnGradient />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Bar — Horizontal
            </h3>
            <ChartBarHorizontal />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Line — Default
            </h3>
            <ChartLineDefault />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Line — With dots
            </h3>
            <ChartLineWithDots />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Line — Dashed
            </h3>
            <ChartLineDashed />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Line — Stepped
            </h3>
            <ChartLineStepped />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Composed — Bar + Line
            </h3>
            <ChartComposedBarLine />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Composed — Area + Bar
            </h3>
            <ChartComposedAreaBar />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Pie
            </h3>
            <ChartPie />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Donut
            </h3>
            <ChartDonut />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Radar — Filled
            </h3>
            <ChartRadarFilled />
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Radar — Lines
            </h3>
            <ChartRadarLines />
          </div>
        </div>
      </section>

      {/* ==================== CIRCULARPROGRESS ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          CircularProgress
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Loading, complete, indeterminate, custom color
            </h3>
            <CircularProgressDemo />
          </div>
        </div>
      </section>

      {/* ==================== CHECKBOX ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Checkbox</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              States
            </h3>
            <CheckboxDemo />
          </div>
        </div>
      </section>

      {/* ==================== COLLAPSIBLE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          Collapsible
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Toggleable section
            </h3>
            <CollapsibleDemo />
          </div>
        </div>
      </section>

      {/* ==================== COLORPICKER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ColorPicker
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Popover with HSL canvas, hue slider, hex input, presets
            </h3>
            <ColorPickerDemo />
          </div>
        </div>
      </section>

      {/* ==================== COLORSWATCH ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ColorSwatch
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Token colors with sizes
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <ColorSwatch color="var(--primary)" />
              <ColorSwatch color="var(--success)" />
              <ColorSwatch color="var(--warning)" />
              <ColorSwatch color="var(--info)" />
              <ColorSwatch color="var(--destructive)" />
              <ColorSwatch color="var(--chart-1)" />
              <ColorSwatch color="var(--chart-2)" />
              <ColorSwatch color="var(--chart-3)" />
              <ColorSwatch color="var(--chart-4)" />
              <ColorSwatch color="var(--chart-5)" />
              <ColorSwatch color="rgba(255,0,0,0.5)" />
              <ColorSwatch />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Sizes
            </h3>
            <div className="flex flex-wrap items-center gap-3">
              <ColorSwatch color="var(--primary)" size="sm" />
              <ColorSwatch color="var(--primary)" />
              <ColorSwatch color="var(--primary)" size="lg" />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== COMBOBOX ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Combobox</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Searchable framework selector
            </h3>
            <ComboboxDemo />
          </div>
        </div>
      </section>

      {/* ==================== COMMAND ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Command</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Command palette with groups
            </h3>
            <CommandDemo />
          </div>
        </div>
      </section>

      {/* ==================== COMMITGRAPH ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          CommitGraph
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Branched topology with merge + tag
            </h3>
            <CommitGraphDemo />
          </div>
        </div>
      </section>

      {/* ==================== CONTEXTMENU ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ContextMenu
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Right-click context actions
            </h3>
            <div className="flex flex-wrap gap-3">
              <ContextMenuDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== CREATABLECOMBOBOX ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          CreatableCombobox
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Type to filter or create a new entry
            </h3>
            <CreatableComboboxDemo />
          </div>
        </div>
      </section>

      {/* ==================== DATAGRID ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Data Grid</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Editable grid with search, sort, and typed cells
            </h3>
            <DataGridDemo />
          </div>
        </div>
      </section>

      {/* ==================== DATATABLE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          Data Table
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Sortable + filterable with toolbar and pagination
            </h3>
            <DataTableDemo />
          </div>
        </div>
      </section>

      {/* ==================== FILTERBAR ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">FilterBar</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Composable filter builder with operators
            </h3>
            <FilterBarDemo />
          </div>
        </div>
      </section>

      {/* ==================== DIALOG ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Dialog</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Settings dialog with form fields
            </h3>
            <div className="flex flex-wrap gap-3">
              <DialogDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== DRAWER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Drawer</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Bottom drawer with actions
            </h3>
            <div className="flex flex-wrap gap-3">
              <DrawerDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== DROPDOWNMENU ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          DropdownMenu
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Account menu with groups and shortcuts
            </h3>
            <div className="flex flex-wrap gap-3">
              <DropdownMenuDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== EMPTY ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Empty</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Default
            </h3>
            <Empty className="border">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Inbox />
                </EmptyMedia>
                <EmptyTitle>No messages yet</EmptyTitle>
                <EmptyDescription>
                  When you receive messages, they will appear here.
                </EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button size="sm">Compose message</Button>
              </EmptyContent>
            </Empty>
          </div>
        </div>
      </section>

      {/* ==================== ENVEDITOR ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">EnvEditor</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Masked values with import/export
            </h3>
            <EnvEditorDemo />
          </div>
        </div>
      </section>

      {/* ==================== ERRORBOUNDARYUI ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ErrorBoundaryUi
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Dev mode with stack trace and component stack
            </h3>
            <ErrorBoundaryUiDemo />
          </div>
        </div>
      </section>

      {/* ==================== FIELD ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Field</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              With Label and Description
            </h3>
            <div className="max-w-sm">
              <Field>
                <FieldLabel htmlFor="field-name">Project Name</FieldLabel>
                <Input id="field-name" placeholder="My new project" />
                <FieldDescription>
                  Used as the display name across the dashboard.
                </FieldDescription>
              </Field>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Error State
            </h3>
            <div className="max-w-sm">
              <Field>
                <FieldLabel htmlFor="field-email">Email</FieldLabel>
                <Input
                  id="field-email"
                  type="email"
                  placeholder="name@company.com"
                  aria-invalid={true}
                />
                <FieldError>Please enter a valid email address.</FieldError>
              </Field>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== FILEUPLOAD ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          FileUpload
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Dropzone with multi-file, validation, progress
            </h3>
            <FileUploadDemo />
          </div>
        </div>
      </section>

      {/* ==================== FLOATINGPANEL ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          Floating Panel
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Draggable, resizable panel with minimize / maximize
            </h3>
            <FloatingPanelDemo />
          </div>
        </div>
      </section>

      {/* ==================== GAUGE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Gauge</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              SVG meter with full circle, semi, custom token, and indeterminate
            </h3>
            <GaugeDemo />
          </div>
        </div>
      </section>

      {/* ==================== HOVERCARD ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">HoverCard</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              User profile on hover
            </h3>
            <div className="flex flex-wrap gap-3">
              <HoverCardDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== INPUT ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Input</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Default
            </h3>
            <div className="flex max-w-sm flex-col gap-3">
              <Input />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              With Placeholder
            </h3>
            <div className="flex max-w-sm flex-col gap-3">
              <Input placeholder="Project name" />
              <Input placeholder="Email address" type="email" />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Disabled
            </h3>
            <div className="flex max-w-sm flex-col gap-3">
              <Input placeholder="Cannot edit" disabled />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== INPUTGROUP ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          InputGroup
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              With Addon Text
            </h3>
            <div className="flex max-w-sm flex-col gap-3">
              <InputGroup>
                <InputGroupAddon align="inline-start">
                  <InputGroupText>https://</InputGroupText>
                </InputGroupAddon>
                <InputGroupInput placeholder="example.com" />
              </InputGroup>
              <InputGroup>
                <InputGroupInput placeholder="Search projects..." />
                <InputGroupAddon align="inline-end">
                  <Search className="size-4 text-muted-foreground" />
                </InputGroupAddon>
              </InputGroup>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== INPUTOTP ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">InputOTP</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              6-digit
            </h3>
            <InputOTPDemo />
          </div>
        </div>
      </section>

      {/* ==================== INPUTPHONE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          InputPhone
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Country picker + formatted phone field
            </h3>
            <InputPhoneDemo />
          </div>
        </div>
      </section>

      {/* ==================== ITEM ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Item</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Variants
            </h3>
            <ItemGroup className="max-w-md">
              <Item variant="outline">
                <ItemMedia variant="icon">
                  <FileText />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Q4 Financial Report</ItemTitle>
                  <ItemDescription>
                    Updated 2 hours ago by Hleb T.
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button size="sm" variant="outline">
                    View
                  </Button>
                </ItemActions>
              </Item>
              <Item variant="muted">
                <ItemMedia variant="icon">
                  <FileText />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Tax Declaration 2024</ItemTitle>
                  <ItemDescription>Submitted on Jan 15, 2025.</ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button size="sm" variant="outline">
                    Download
                  </Button>
                </ItemActions>
              </Item>
              <Item>
                <ItemMedia variant="icon">
                  <FileText />
                </ItemMedia>
                <ItemContent>
                  <ItemTitle>Budget Forecast Q1</ItemTitle>
                  <ItemDescription>
                    Draft, last edited yesterday.
                  </ItemDescription>
                </ItemContent>
                <ItemActions>
                  <Button size="sm" variant="ghost">
                    Edit
                  </Button>
                </ItemActions>
              </Item>
            </ItemGroup>
          </div>
        </div>
      </section>

      {/* ==================== JSONVIEWER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          JsonViewer
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Tree view, syntax via chart tokens, optional search
            </h3>
            <JsonViewerDemo />
          </div>
        </div>
      </section>

      {/* ==================== KBD ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Kbd</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Single Keys
            </h3>
            <div className="flex flex-wrap gap-3">
              <Kbd>⌘</Kbd>
              <Kbd>⇧</Kbd>
              <Kbd>⌥</Kbd>
              <Kbd>⌃</Kbd>
              <Kbd>Enter</Kbd>
              <Kbd>Esc</Kbd>
              <Kbd>Tab</Kbd>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Combinations
            </h3>
            <div className="flex flex-wrap gap-3">
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>C</Kbd>
              </KbdGroup>
              <KbdGroup>
                <Kbd>⌘</Kbd>
                <Kbd>⇧</Kbd>
                <Kbd>P</Kbd>
              </KbdGroup>
              <KbdGroup>
                <Kbd>Ctrl</Kbd>
                <Kbd>K</Kbd>
              </KbdGroup>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== KEYVALUE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">KeyValue</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Generic key/value editor with paste-parsing
            </h3>
            <KeyValueDemo />
          </div>
        </div>
      </section>

      {/* ==================== LABEL ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Label</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Standalone
            </h3>
            <div className="flex flex-col gap-3">
              <Label>Project Name</Label>
              <Label>Email Address</Label>
              <Label>Due Date</Label>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== BUTTONLIQUIDMETAL ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ButtonLiquidMetal
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Text and icon modes
            </h3>
            <LiquidMetalDemo />
          </div>
        </div>
      </section>

      {/* ==================== MARQUEE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Marquee</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Pause on hover, reverse, custom speed
            </h3>
            <MarqueeDemo />
          </div>
        </div>
      </section>

      {/* ==================== MENTION ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Mention</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Type @ to mention a team member
            </h3>
            <MentionDemo />
          </div>
        </div>
      </section>

      {/* ==================== MENUBAR ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Menubar</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              File / Edit / View menus
            </h3>
            <Menubar>
              <MenubarMenu>
                <MenubarTrigger>File</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem>
                    New File <MenubarShortcut>⌘N</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem>
                    Open... <MenubarShortcut>⌘O</MenubarShortcut>
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem>
                    Save <MenubarShortcut>⌘S</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem>Save As...</MenubarItem>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger>Edit</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem>
                    Undo <MenubarShortcut>⌘Z</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem>
                    Redo <MenubarShortcut>⌘⇧Z</MenubarShortcut>
                  </MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem>
                    Cut <MenubarShortcut>⌘X</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem>
                    Copy <MenubarShortcut>⌘C</MenubarShortcut>
                  </MenubarItem>
                  <MenubarItem>
                    Paste <MenubarShortcut>⌘V</MenubarShortcut>
                  </MenubarItem>
                </MenubarContent>
              </MenubarMenu>
              <MenubarMenu>
                <MenubarTrigger>View</MenubarTrigger>
                <MenubarContent>
                  <MenubarItem>Zoom In</MenubarItem>
                  <MenubarItem>Zoom Out</MenubarItem>
                  <MenubarSeparator />
                  <MenubarItem>Full Screen</MenubarItem>
                </MenubarContent>
              </MenubarMenu>
            </Menubar>
          </div>
        </div>
      </section>

      {/* ==================== MULTISTEPLOADER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          MultiStepLoader
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Full-screen overlay with check-icon sequence
            </h3>
            <MultiStepLoaderDemo />
          </div>
        </div>
      </section>

      {/* ==================== NATIVESELECT ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          NativeSelect
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Default
            </h3>
            <div className="flex flex-wrap gap-4">
              <NativeSelect>
                <NativeSelectOption value="">Select region</NativeSelectOption>
                <NativeSelectOption value="eu">Europe</NativeSelectOption>
                <NativeSelectOption value="us">
                  North America
                </NativeSelectOption>
                <NativeSelectOption value="asia">
                  Asia Pacific
                </NativeSelectOption>
              </NativeSelect>
              <NativeSelect disabled>
                <NativeSelectOption value="">Disabled</NativeSelectOption>
              </NativeSelect>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== NAVIGATIONMENU ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          NavigationMenu
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Top-level items with dropdown
            </h3>
            <NavigationMenu viewport={false}>
              <NavigationMenuList>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Products</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="flex w-40 flex-col gap-1 p-1">
                      <NavigationMenuLink href="#">
                        Analytics
                      </NavigationMenuLink>
                      <NavigationMenuLink href="#">Finance</NavigationMenuLink>
                      <NavigationMenuLink href="#">
                        Reporting
                      </NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuTrigger>Company</NavigationMenuTrigger>
                  <NavigationMenuContent>
                    <div className="flex w-40 flex-col gap-1 p-1">
                      <NavigationMenuLink href="#">About</NavigationMenuLink>
                      <NavigationMenuLink href="#">Careers</NavigationMenuLink>
                    </div>
                  </NavigationMenuContent>
                </NavigationMenuItem>
                <NavigationMenuItem>
                  <NavigationMenuLink href="#" className={undefined}>
                    Pricing
                  </NavigationMenuLink>
                </NavigationMenuItem>
              </NavigationMenuList>
            </NavigationMenu>
          </div>
        </div>
      </section>

      {/* ==================== NOISEBACKGROUND ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          NoiseBackground
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Animated gradients with SVG noise overlay
            </h3>
            <NoiseBackgroundDemo />
          </div>
        </div>
      </section>

      {/* ==================== PAGINATION ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          Pagination
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Basic
            </h3>
            <Pagination>
              <PaginationContent>
                <PaginationItem>
                  <PaginationPrevious href="#" />
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">1</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#" isActive>
                    2
                  </PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationLink href="#">3</PaginationLink>
                </PaginationItem>
                <PaginationItem>
                  <PaginationEllipsis />
                </PaginationItem>
                <PaginationItem>
                  <PaginationNext href="#" />
                </PaginationItem>
              </PaginationContent>
            </Pagination>
          </div>
        </div>
      </section>

      {/* ==================== PDFVIEWER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          PDF Viewer
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Single / scroll / book modes with zoom
            </h3>
            <PdfViewerDemo />
          </div>
        </div>
      </section>

      {/* ==================== POPOVER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Popover</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Filter panel
            </h3>
            <div className="flex flex-wrap gap-3">
              <PopoverDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PROGRESS ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Progress</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Values
            </h3>
            <div className="flex max-w-sm flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">0%</span>
                <Progress value={0} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">33%</span>
                <Progress value={33} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">66%</span>
                <Progress value={66} />
              </div>
              <div className="flex flex-col gap-1">
                <span className="text-xs text-muted-foreground">100%</span>
                <Progress value={100} />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== PROMPTLIBRARY ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          Prompt Library
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Searchable popover of reusable prompts
            </h3>
            <PromptLibraryDemo />
          </div>
        </div>
      </section>

      {/* ==================== QRCODE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">QRCode</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Canvas + SVG output, download, overlay logo
            </h3>
            <QRCodeDemo />
          </div>
        </div>
      </section>

      {/* ==================== RADIOGROUP ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          RadioGroup
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Options
            </h3>
            <RadioGroupDemo />
          </div>
        </div>
      </section>

      {/* ==================== RESIZABLE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Resizable</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Two-panel horizontal layout
            </h3>
            <ResizableDemo />
          </div>
        </div>
      </section>

      {/* ==================== RINGLOADER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          RingLoader
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Sizes, colors, custom --duration
            </h3>
            <RingLoaderDemo />
          </div>
        </div>
      </section>

      {/* ==================== SCROLLAREA ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ScrollArea
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Fixed-height list
            </h3>
            <ScrollArea className="h-48 w-64 rounded-lg border">
              <div className="p-3">
                {[
                  "Invoices",
                  "Expenses",
                  "Payroll",
                  "Bank Statements",
                  "Tax Reports",
                  "Purchase Orders",
                  "Contracts",
                  "Receipts",
                  "Budgets",
                  "Forecasts",
                ].map((item) => (
                  <div
                    key={item}
                    className="border-b py-2 text-sm last:border-0"
                  >
                    {item}
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </div>
      </section>

      {/* ==================== INPUTSEGMENTED ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          InputSegmented
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Joined inputs for split-field entry (date of birth)
            </h3>
            <InputSegmentedDemo />
          </div>
        </div>
      </section>

      {/* ==================== SELECT ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Select</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Options
            </h3>
            <SelectDemo />
          </div>
        </div>
      </section>

      {/* ==================== SEPARATOR ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Separator</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Horizontal
            </h3>
            <div className="flex flex-col gap-3">
              <span className="text-sm text-muted-foreground">
                Above the line
              </span>
              <Separator orientation="horizontal" />
              <span className="text-sm text-muted-foreground">
                Below the line
              </span>
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Vertical
            </h3>
            <div className="flex h-8 items-center gap-3">
              <span className="text-sm text-muted-foreground">Left</span>
              <Separator orientation="vertical" />
              <span className="text-sm text-muted-foreground">Right</span>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SHEET ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Sheet</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Right side panel with settings
            </h3>
            <div className="flex flex-wrap gap-3">
              <SheetDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SIGNATUREPAD ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          SignaturePad
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Draw a signature, clear with the reset icon
            </h3>
            <SignaturePadDemo />
          </div>
        </div>
      </section>

      {/* ==================== SIDEBAR ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Sidebar</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Collapsible sidebar with menu, header, and footer
            </h3>
            <SidebarDemo />
          </div>
        </div>
      </section>

      {/* ==================== SKELETON ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Skeleton</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Shapes
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              <Skeleton className="h-16 w-24 rounded-lg" />
              <Skeleton className="size-12 rounded-full" />
              <div className="flex flex-col gap-2">
                <Skeleton className="h-4 w-48" />
                <Skeleton className="h-4 w-36" />
                <Skeleton className="h-4 w-52" />
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SLIDER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Slider</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Values
            </h3>
            <SliderDemo />
          </div>
        </div>
      </section>

      {/* ==================== SNAILTIMER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          SnailTimer
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              30-second countdown with token-themed SVG snail
            </h3>
            <SnailTimerDemo />
          </div>
        </div>
      </section>

      {/* ==================== SONNER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Sonner</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Toast notifications
            </h3>
            <SonnerDemo />
          </div>
        </div>
      </section>

      {/* ==================== SPINNER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Spinner</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Sizes
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              <Spinner className="size-4" />
              <Spinner className="size-6" />
              <Spinner className="size-8" />
              <Spinner className="size-10" />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== STATEFULBUTTON ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          StatefulButton
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Loading and success/error states
            </h3>
            <StatefulButtonDemo />
          </div>
        </div>
      </section>

      {/* ==================== SWAP ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Swap</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Animations
            </h3>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                <Swap
                  animation="fade"
                  className="size-10 rounded-md border p-2"
                >
                  <SwapOff>
                    <SunIcon className="size-5" />
                  </SwapOff>
                  <SwapOn>
                    <MoonIcon className="size-5" />
                  </SwapOn>
                </Swap>
                <span className="text-xs text-muted-foreground">Fade</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Swap
                  animation="rotate"
                  className="size-10 rounded-md border p-2"
                >
                  <SwapOff>
                    <SunIcon className="size-5" />
                  </SwapOff>
                  <SwapOn>
                    <MoonIcon className="size-5" />
                  </SwapOn>
                </Swap>
                <span className="text-xs text-muted-foreground">Rotate</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Swap
                  animation="flip"
                  className="size-10 rounded-md border p-2"
                >
                  <SwapOff>
                    <Volume2Icon className="size-5" />
                  </SwapOff>
                  <SwapOn>
                    <VolumeOffIcon className="size-5" />
                  </SwapOn>
                </Swap>
                <span className="text-xs text-muted-foreground">Flip</span>
              </div>
              <div className="flex flex-col items-center gap-1">
                <Swap
                  animation="scale"
                  className="size-10 rounded-md border p-2"
                >
                  <SwapOff>
                    <SunIcon className="size-5" />
                  </SwapOff>
                  <SwapOn>
                    <MoonIcon className="size-5" />
                  </SwapOn>
                </Swap>
                <span className="text-xs text-muted-foreground">Scale</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SWITCH ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Switch</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              States
            </h3>
            <SwitchDemo />
          </div>
        </div>
      </section>

      {/* ==================== TABLE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Table</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Sample Data
            </h3>
            <Table>
              <TableCaption>Recent invoices</TableCaption>
              <TableHeader>
                <TableRow>
                  <TableHead>Invoice</TableHead>
                  <TableHead>Client</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>#INV-001</TableCell>
                  <TableCell>Acme Corp</TableCell>
                  <TableCell>12 500 Kč</TableCell>
                  <TableCell>
                    <Badge variant="default">Paid</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>#INV-002</TableCell>
                  <TableCell>BuildCo</TableCell>
                  <TableCell>8 200 Kč</TableCell>
                  <TableCell>
                    <Badge variant="secondary">Pending</Badge>
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>#INV-003</TableCell>
                  <TableCell>FinGroup</TableCell>
                  <TableCell>31 000 Kč</TableCell>
                  <TableCell>
                    <Badge variant="destructive">Overdue</Badge>
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </div>
      </section>

      {/* ==================== TABS ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Tabs</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Default (horizontal)
            </h3>
            <Tabs defaultValue="account" className="max-w-md">
              <TabsList>
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
              </TabsList>
              <TabsContent value="account">
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Manage your account details, display name, and avatar.
                </div>
              </TabsContent>
              <TabsContent value="security">
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Update your password, enable 2FA, and view active sessions.
                </div>
              </TabsContent>
              <TabsContent value="notifications">
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Configure email, push, and in-app notification preferences.
                </div>
              </TabsContent>
            </Tabs>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Line variant
            </h3>
            <Tabs defaultValue="account" className="max-w-md">
              <TabsList variant="line">
                <TabsTrigger value="account">Account</TabsTrigger>
                <TabsTrigger value="security">Security</TabsTrigger>
                <TabsTrigger value="notifications">Notifications</TabsTrigger>
              </TabsList>
              <TabsContent value="account">
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Account settings panel.
                </div>
              </TabsContent>
              <TabsContent value="security">
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Security settings panel.
                </div>
              </TabsContent>
              <TabsContent value="notifications">
                <div className="rounded-lg border p-4 text-sm text-muted-foreground">
                  Notifications settings panel.
                </div>
              </TabsContent>
            </Tabs>
          </div>
        </div>
      </section>

      {/* ==================== INPUTTAGS ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">InputTags</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Add and remove tags with the keyboard
            </h3>
            <InputTagsDemo />
          </div>
        </div>
      </section>

      {/* ==================== TEXTAREA ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Textarea</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Default
            </h3>
            <div className="max-w-sm">
              <Textarea />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              With Placeholder
            </h3>
            <div className="max-w-sm">
              <Textarea placeholder="Describe the issue in detail..." />
            </div>
          </div>
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Disabled
            </h3>
            <div className="max-w-sm">
              <Textarea placeholder="Read-only content" disabled />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== TIMELINE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Timeline</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Vertical timeline with active step
            </h3>
            <TimelineDemo />
          </div>
        </div>
      </section>

      {/* ==================== TOGGLE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Toggle</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Variants and states
            </h3>
            <ToggleDemo />
          </div>
        </div>
      </section>

      {/* ==================== TOGGLEGROUP ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          ToggleGroup
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Text alignment group
            </h3>
            <ToggleGroupDemo />
          </div>
        </div>
      </section>

      {/* ==================== TOOLTIP ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Tooltip</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Icon buttons with tooltips
            </h3>
            <div className="flex flex-wrap gap-3">
              <TooltipDemo />
            </div>
          </div>
        </div>
      </section>

      {/* ==================== TOUR ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">Tour</h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Multi-step product tour with spotlight
            </h3>
            <TourDemo />
          </div>
        </div>
      </section>

      {/* ==================== WEBHOOKTESTER ==================== */}
      <section className="mb-16">
        <h2 className="mb-6 border-b pb-2 text-2xl font-semibold">
          WebhookTester
        </h2>
        <div className="flex flex-col gap-6">
          <div>
            <h3 className="mb-3 text-sm font-medium text-muted-foreground">
              Mock onSend handler (no real network)
            </h3>
            <WebhookTesterDemo />
          </div>
        </div>
      </section>
      <ScrollToTop />
    </div>
  )
}
