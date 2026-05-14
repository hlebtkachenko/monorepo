import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import { Heading } from "@workspace/ui/components/heading"
import { Text } from "@workspace/ui/components/text"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import { Badge } from "@workspace/ui/components/badge"
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarIcon,
  CheckIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Copy,
  Download,
  Eye,
  EyeOff,
  File,
  FilterIcon,
  Globe,
  Home,
  InfoIcon,
  LinkIcon,
  Loader2Icon,
  Lock,
  Moon,
  MoreHorizontalIcon,
  Palette,
  PanelLeftIcon,
  Plus,
  RefreshCw,
  Search,
  Settings,
  Sun,
  Trash2,
  Upload,
  X,
  XIcon,
} from "@workspace/ui/lib/icons"

export const metadata = {
  title: "Typography",
}

export default function TypographyPage() {
  return (
    <div className="mx-auto max-w-4xl p-8">
      <div className="mb-12 flex items-center justify-between">
        <div>
          <h1>Typography</h1>
          <Text variant="lead">
            Design system typography scale, text presets, and font
            configuration.
          </Text>
        </div>
        <ThemeToggle />
      </div>

      {/* ==================== HEADING SCALE ==================== */}
      <section className="mb-16">
        <h2 className="mb-6">Heading Scale</h2>
        <Text variant="muted" className="mb-8">
          Headings use the <Text variant="inline-code">font-heading</Text> font
          family. Base styles are applied via{" "}
          <Text variant="inline-code">@layer base</Text> in globals.css, so bare{" "}
          <Text variant="inline-code">&lt;h1&gt;</Text>-
          <Text variant="inline-code">&lt;h4&gt;</Text> elements are styled
          automatically.
        </Text>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                H1
                <Badge variant="outline">text-4xl / text-5xl</Badge>
                <Badge variant="outline">font-bold</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-6">
                <Heading level={1}>
                  Taxing Laughter: The Joke Tax Chronicles
                </Heading>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">Component</Badge>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  {"<Heading level={1}>...</Heading>"}
                </code>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">HTML</Badge>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  {"<h1>...</h1>"}
                </code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                H2
                <Badge variant="outline">text-3xl</Badge>
                <Badge variant="outline">font-semibold</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-6">
                <Heading level={2}>The King&apos;s Plan</Heading>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">Component</Badge>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  {"<Heading level={2}>...</Heading>"}
                </code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                H3
                <Badge variant="outline">text-2xl</Badge>
                <Badge variant="outline">font-semibold</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-6">
                <Heading level={3}>The Joke Tax</Heading>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">Component</Badge>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  {"<Heading level={3}>...</Heading>"}
                </code>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                H4
                <Badge variant="outline">text-xl</Badge>
                <Badge variant="outline">font-semibold</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="rounded-lg border bg-muted/30 p-6">
                <Heading level={4}>People Stopped Telling Jokes</Heading>
              </div>
              <div className="flex gap-2">
                <Badge variant="secondary">Component</Badge>
                <code className="rounded bg-muted px-2 py-1 text-xs">
                  {"<Heading level={4}>...</Heading>"}
                </code>
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="mb-16" />

      {/* ==================== TEXT VARIANTS ==================== */}
      <section className="mb-16">
        <h2 className="mb-6">Text Variants</h2>
        <Text variant="muted" className="mb-8">
          The <Text variant="inline-code">Text</Text> component renders semantic
          HTML elements based on variant: paragraphs, blockquotes, and inline
          code.
        </Text>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Default (Paragraph)
                <Badge variant="outline">leading-7</Badge>
                <Badge variant="outline">auto mt-6</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text>
                  The king, seeing how much happier his subjects were, realized
                  the error of his ways and repealed the joke tax. Jokester
                  production skyrocketed, and the kingdom became known as the
                  funniest place in the world.
                </Text>
                <Text>
                  The king&apos;s subjects, however, were not as amused. They
                  grumbled and complained, but the king was firm in his
                  decision.
                </Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {"<Text>paragraph text</Text>"}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Lead
                <Badge variant="outline">text-xl</Badge>
                <Badge variant="outline">text-muted-foreground</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text variant="lead">
                  A modal dialog that interrupts the user with important content
                  and expects a response.
                </Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Text variant="lead">...</Text>'}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Large
                <Badge variant="outline">text-lg</Badge>
                <Badge variant="outline">font-semibold</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text variant="large">Are you absolutely sure?</Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Text variant="large">...</Text>'}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Small
                <Badge variant="outline">text-sm</Badge>
                <Badge variant="outline">font-medium</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text variant="small">Email address</Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Text variant="small">...</Text>'}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Muted
                <Badge variant="outline">text-sm</Badge>
                <Badge variant="outline">text-muted-foreground</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text variant="muted">Enter your email address.</Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Text variant="muted">...</Text>'}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Subtle
                <Badge variant="outline">text-sm</Badge>
                <Badge variant="outline">text-foreground/60</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text variant="subtle">
                  Secondary information that fades into the background, inspired
                  by Notion&apos;s multi-level foreground opacity system.
                </Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Text variant="subtle">...</Text>'}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Caption
                <Badge variant="outline">text-xs</Badge>
                <Badge variant="outline">&lt;figcaption&gt;</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text variant="caption">
                  Figure 1: Quarterly revenue breakdown by organization, FY 2026
                </Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Text variant="caption">...</Text>'}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Overline
                <Badge variant="outline">text-xs uppercase</Badge>
                <Badge variant="outline">tracking-wider</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text variant="overline">Section Label</Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Text variant="overline">...</Text>'}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Blockquote
                <Badge variant="outline">text-lg italic</Badge>
                <Badge variant="outline">border-l-2</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text variant="blockquote">
                  After all, everyone enjoys a good joke, so it&apos;s only fair
                  that they should pay for the privilege.
                </Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Text variant="blockquote">...</Text>'}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                Inline Code
                <Badge variant="outline">font-mono</Badge>
                <Badge variant="outline">bg-muted</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="rounded-lg border bg-muted/30 p-6">
                <Text>
                  Use the{" "}
                  <Text variant="inline-code">@radix-ui/react-dialog</Text>{" "}
                  package for accessible dialogs.
                </Text>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Text variant="inline-code">code</Text>'}
              </code>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="mb-16" />

      {/* ==================== FULL DEMO ==================== */}
      <section className="mb-16">
        <h2 className="mb-6">Full Article Demo</h2>
        <Text variant="muted" className="mb-8">
          All typography elements composed together, matching shadcn&apos;s
          reference demo.
        </Text>

        <Card>
          <CardContent className="space-y-0 pt-6">
            <Heading level={1}>
              Taxing Laughter: The Joke Tax Chronicles
            </Heading>
            <Text variant="lead">
              Once upon a time, in a far-off land, there was a very lazy king
              who spent all day lounging on his throne. One day, his advisors
              came to him with a problem: the kingdom was running out of money.
            </Text>
            <Heading level={2}>The King&apos;s Plan</Heading>
            <Text>
              The king thought long and hard, and finally came up with a
              brilliant plan: he would tax the jokes in the kingdom.
            </Text>
            <Text variant="blockquote">
              After all, everyone enjoys a good joke, so it&apos;s only fair
              that they should pay for the privilege.
            </Text>
            <Heading level={3}>The Joke Tax</Heading>
            <Text>
              The king&apos;s subjects were not amused. They grumbled and
              complained, but the king was firm in his decision. He even hired a
              team of joke tax collectors to enforce the new policy.
            </Text>
            <Heading level={4}>People Stopped Telling Jokes</Heading>
            <Text>
              The people of the kingdom, burdened by the joke tax, stopped
              telling jokes altogether. Laughter was replaced by silence, and
              the streets were devoid of joy.
            </Text>
            <Text variant="muted">
              This is a work of fiction. Any resemblance to actual events or
              locales or persons, living or dead, is entirely coincidental.
            </Text>
          </CardContent>
        </Card>
      </section>

      <Separator className="mb-16" />

      {/* ==================== FONT CONFIG ==================== */}
      <section className="mb-16">
        <h2 className="mb-6">Font Configuration</h2>

        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Sans (Body)</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-sans text-lg">Geist</p>
              <Text variant="muted">--font-sans</Text>
              <p className="mt-3 font-sans text-sm">
                ABCDEFGHIJKLMNOPQRSTUVWXYZ
                <br />
                abcdefghijklmnopqrstuvwxyz
                <br />
                0123456789
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Heading</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-heading text-lg">Roobert</p>
              <Text variant="muted">--font-heading</Text>
              <p className="mt-3 font-heading text-sm">
                ABCDEFGHIJKLMNOPQRSTUVWXYZ
                <br />
                abcdefghijklmnopqrstuvwxyz
                <br />
                0123456789
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Mono</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="font-mono text-lg">Roobert SemiMono</p>
              <Text variant="muted">--font-mono</Text>
              <p className="mt-3 font-mono text-sm">
                ABCDEFGHIJKLMNOPQRSTUVWXYZ
                <br />
                abcdefghijklmnopqrstuvwxyz
                <br />
                0123456789
              </p>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="mb-16" />

      {/* ==================== NUMBERS ==================== */}
      <section className="mb-16">
        <h2 className="mb-6">Numbers &amp; Data</h2>
        <Text variant="muted" className="mb-8">
          How each font renders numbers, currencies, and data patterns common in
          accounting software.
        </Text>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Side-by-Side Comparison</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pr-6 pb-2 font-medium text-muted-foreground">
                        Sample
                      </th>
                      <th className="pr-6 pb-2 font-medium text-muted-foreground">
                        Geist (body)
                      </th>
                      <th className="pr-6 pb-2 font-medium text-muted-foreground">
                        Roobert (heading)
                      </th>
                      <th className="pb-2 font-medium text-muted-foreground">
                        Roobert SemiMono
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {[
                      "0123456789",
                      "1,234,567.89",
                      "CZK 1 250 000,00",
                      "EUR 42,069.99",
                      "$3.14",
                      "-12,345.67",
                      "+0.05%",
                      "2026-05-15",
                      "14:30:00",
                      "ICO: 12345678",
                      "CZ1234567890",
                    ].map((sample) => (
                      <tr key={sample} className="border-b last:border-0">
                        <td className="py-2.5 pr-6 text-xs text-muted-foreground">
                          {sample.length > 16
                            ? sample.slice(0, 16) + "..."
                            : sample}
                        </td>
                        <td className="py-2.5 pr-6 font-sans">{sample}</td>
                        <td className="py-2.5 pr-6 font-heading">{sample}</td>
                        <td className="py-2.5 font-mono">{sample}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Large Numbers (Dashboard KPIs)</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 md:grid-cols-3">
                <div className="space-y-1">
                  <Text variant="overline">Revenue (body font)</Text>
                  <p className="font-sans text-3xl font-bold tracking-tight">
                    1 250 000 Kc
                  </p>
                </div>
                <div className="space-y-1">
                  <Text variant="overline">Revenue (heading font)</Text>
                  <p className="font-heading text-3xl font-bold tracking-tight">
                    1 250 000 Kc
                  </p>
                </div>
                <div className="space-y-1">
                  <Text variant="overline">Revenue (mono font)</Text>
                  <p className="font-mono text-3xl font-bold tracking-tight">
                    1 250 000 Kc
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Tabular Numbers</CardTitle>
            </CardHeader>
            <CardContent>
              <Text variant="muted" className="mb-4">
                Numbers that should align vertically in tables. Compare
                proportional vs monospace rendering.
              </Text>
              <div className="grid gap-8 md:grid-cols-3">
                <div>
                  <Text variant="overline">Geist (body)</Text>
                  <div className="mt-2 space-y-0.5 font-sans text-sm tabular-nums">
                    <p className="text-right">1,234.56</p>
                    <p className="text-right">789.00</p>
                    <p className="text-right">12,345,678.90</p>
                    <p className="text-right">0.01</p>
                    <p className="border-t pt-0.5 text-right font-semibold">
                      12,347,702.47
                    </p>
                  </div>
                </div>
                <div>
                  <Text variant="overline">Roobert (heading)</Text>
                  <div className="mt-2 space-y-0.5 font-heading text-sm tabular-nums">
                    <p className="text-right">1,234.56</p>
                    <p className="text-right">789.00</p>
                    <p className="text-right">12,345,678.90</p>
                    <p className="text-right">0.01</p>
                    <p className="border-t pt-0.5 text-right font-semibold">
                      12,347,702.47
                    </p>
                  </div>
                </div>
                <div>
                  <Text variant="overline">Roobert SemiMono</Text>
                  <div className="mt-2 space-y-0.5 font-mono text-sm">
                    <p className="text-right">1,234.56</p>
                    <p className="text-right">789.00</p>
                    <p className="text-right">12,345,678.90</p>
                    <p className="text-right">0.01</p>
                    <p className="border-t pt-0.5 text-right font-semibold">
                      12,347,702.47
                    </p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Weight Variants with Numbers</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-8 md:grid-cols-3">
                <div>
                  <Text variant="overline">Geist (body)</Text>
                  <div className="mt-2 space-y-1 font-sans">
                    <p className="font-light">300: 1,250,000.00 Kc</p>
                    <p className="font-normal">400: 1,250,000.00 Kc</p>
                    <p className="font-medium">500: 1,250,000.00 Kc</p>
                    <p className="font-semibold">600: 1,250,000.00 Kc</p>
                    <p className="font-bold">700: 1,250,000.00 Kc</p>
                    <p className="font-extrabold">800: 1,250,000.00 Kc</p>
                  </div>
                </div>
                <div>
                  <Text variant="overline">Roobert (heading)</Text>
                  <div className="mt-2 space-y-1 font-heading">
                    <p className="font-light">300: 1,250,000.00 Kc</p>
                    <p className="font-normal">400: 1,250,000.00 Kc</p>
                    <p className="font-medium">500: 1,250,000.00 Kc</p>
                    <p className="font-semibold">600: 1,250,000.00 Kc</p>
                    <p className="font-bold">700: 1,250,000.00 Kc</p>
                    <p className="font-extrabold">800: 1,250,000.00 Kc</p>
                  </div>
                </div>
                <div>
                  <Text variant="overline">Roobert SemiMono</Text>
                  <div className="mt-2 space-y-1 font-mono">
                    <p className="font-light">300: 1,250,000.00 Kc</p>
                    <p className="font-normal">400: 1,250,000.00 Kc</p>
                    <p className="font-medium">500: 1,250,000.00 Kc</p>
                    <p className="font-semibold">600: 1,250,000.00 Kc</p>
                    <p className="font-bold">700: 1,250,000.00 Kc</p>
                    <p className="font-extrabold">800: 1,250,000.00 Kc</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Real-World Accounting Examples</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="pr-4 pb-2 font-medium text-muted-foreground">
                        Invoice
                      </th>
                      <th className="pr-4 pb-2 font-medium text-muted-foreground">
                        Client
                      </th>
                      <th className="pr-4 pb-2 text-right font-medium text-muted-foreground">
                        Amount
                      </th>
                      <th className="pr-4 pb-2 text-right font-medium text-muted-foreground">
                        VAT 21%
                      </th>
                      <th className="pb-2 text-right font-medium text-muted-foreground">
                        Total
                      </th>
                    </tr>
                  </thead>
                  <tbody className="font-mono tabular-nums">
                    <tr className="border-b">
                      <td className="py-2 pr-4 font-sans">FV-2026-0042</td>
                      <td className="py-2 pr-4 font-sans">HAPD s.r.o.</td>
                      <td className="py-2 pr-4 text-right">45 000,00</td>
                      <td className="py-2 pr-4 text-right">9 450,00</td>
                      <td className="py-2 text-right font-semibold">
                        54 450,00
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4 font-sans">FV-2026-0043</td>
                      <td className="py-2 pr-4 font-sans">Rotary Club Praha</td>
                      <td className="py-2 pr-4 text-right">12 500,00</td>
                      <td className="py-2 pr-4 text-right">2 625,00</td>
                      <td className="py-2 text-right font-semibold">
                        15 125,00
                      </td>
                    </tr>
                    <tr className="border-b">
                      <td className="py-2 pr-4 font-sans">FV-2026-0044</td>
                      <td className="py-2 pr-4 font-sans">Henderson Profese</td>
                      <td className="py-2 pr-4 text-right">187 320,00</td>
                      <td className="py-2 pr-4 text-right">39 337,20</td>
                      <td className="py-2 text-right font-semibold">
                        226 657,20
                      </td>
                    </tr>
                    <tr>
                      <td
                        colSpan={2}
                        className="py-2 pr-4 font-sans font-semibold"
                      >
                        Total
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        244 820,00
                      </td>
                      <td className="py-2 pr-4 text-right font-semibold">
                        51 412,20
                      </td>
                      <td className="py-2 text-right font-bold">296 232,20</td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <Text variant="caption" className="mt-3">
                Invoice numbers and client names in body font (Geist), amounts
                in mono font (Roobert SemiMono) with tabular-nums for column
                alignment.
              </Text>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="mb-16" />

      {/* ==================== ICONS ==================== */}
      <section className="mb-16">
        <h2 className="mb-6">Icons</h2>
        <Text variant="muted" className="mb-4">
          103 icons re-exported from{" "}
          <Text variant="inline-code">lucide-react</Text> via{" "}
          <Text variant="inline-code">@workspace/ui/lib/icons</Text>. Default
          size: <Text variant="inline-code">size-4</Text> (16px). Components
          auto-size child SVGs via{" "}
          <Text variant="inline-code">
            {"[&_svg:not([class*='size-'])]:size-4"}
          </Text>
          .
        </Text>

        <div className="space-y-8">
          <Card>
            <CardHeader>
              <CardTitle>Common Icons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-6 gap-4 sm:grid-cols-8 md:grid-cols-10">
                {[
                  { icon: Home, name: "Home" },
                  { icon: Search, name: "Search" },
                  { icon: Settings, name: "Settings" },
                  { icon: Plus, name: "Plus" },
                  { icon: X, name: "X" },
                  { icon: CheckIcon, name: "Check" },
                  { icon: Copy, name: "Copy" },
                  { icon: Trash2, name: "Trash2" },
                  { icon: Download, name: "Download" },
                  { icon: Upload, name: "Upload" },
                  { icon: Eye, name: "Eye" },
                  { icon: EyeOff, name: "EyeOff" },
                  { icon: Lock, name: "Lock" },
                  { icon: Globe, name: "Globe" },
                  { icon: LinkIcon, name: "Link" },
                  { icon: CalendarIcon, name: "Calendar" },
                  { icon: FilterIcon, name: "Filter" },
                  { icon: InfoIcon, name: "Info" },
                  { icon: AlertTriangle, name: "Alert" },
                  { icon: RefreshCw, name: "Refresh" },
                  { icon: File, name: "File" },
                  { icon: Moon, name: "Moon" },
                  { icon: Sun, name: "Sun" },
                  { icon: Palette, name: "Palette" },
                  { icon: PanelLeftIcon, name: "Panel" },
                  { icon: MoreHorizontalIcon, name: "More" },
                  { icon: Loader2Icon, name: "Loader" },
                  { icon: XIcon, name: "XIcon" },
                  { icon: ArrowUp, name: "ArrowUp" },
                  { icon: ArrowDown, name: "ArrowDown" },
                ].map(({ icon: Icon, name }) => (
                  <div
                    key={name}
                    className="flex flex-col items-center gap-1.5 rounded-lg border p-3 transition-colors hover:bg-muted"
                  >
                    <Icon className="size-5" />
                    <span className="text-[10px] text-muted-foreground">
                      {name}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Sizes</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-end gap-6">
                {[
                  { size: "size-3", label: "12px" },
                  { size: "size-3.5", label: "14px" },
                  { size: "size-4", label: "16px (default)" },
                  { size: "size-5", label: "20px" },
                  { size: "size-6", label: "24px" },
                  { size: "size-8", label: "32px" },
                ].map(({ size, label }) => (
                  <div key={size} className="flex flex-col items-center gap-2">
                    <Settings className={size} />
                    <span className="text-xs text-muted-foreground">
                      {label}
                    </span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Color</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                <div className="flex flex-col items-center gap-1.5">
                  <Settings className="size-5" />
                  <span className="text-[10px] text-muted-foreground">
                    default
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <Settings className="size-5 text-primary" />
                  <span className="text-[10px] text-muted-foreground">
                    text-primary
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <Settings className="size-5 text-destructive" />
                  <span className="text-[10px] text-muted-foreground">
                    text-destructive
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <Settings className="size-5 text-success" />
                  <span className="text-[10px] text-muted-foreground">
                    text-success
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <Settings className="size-5 text-warning" />
                  <span className="text-[10px] text-muted-foreground">
                    text-warning
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <Settings className="size-5 text-info" />
                  <span className="text-[10px] text-muted-foreground">
                    text-info
                  </span>
                </div>
                <div className="flex flex-col items-center gap-1.5">
                  <Settings className="size-5 text-muted-foreground" />
                  <span className="text-[10px] text-muted-foreground">
                    muted
                  </span>
                </div>
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {'<Settings className="text-primary" />'}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Stroke Width</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-6">
                {[1, 1.5, 2, 2.5, 3].map((sw) => (
                  <div key={sw} className="flex flex-col items-center gap-1.5">
                    <Settings className="size-6" strokeWidth={sw} />
                    <span className="text-[10px] text-muted-foreground">
                      {sw}
                    </span>
                  </div>
                ))}
              </div>
              <code className="mt-3 block rounded bg-muted px-2 py-1 text-xs">
                {"<Settings strokeWidth={1.5} />"}
              </code>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>absoluteStrokeWidth</CardTitle>
            </CardHeader>
            <CardContent>
              <Text variant="muted" className="mb-4">
                Without <Text variant="inline-code">absoluteStrokeWidth</Text>,
                stroke scales with icon size. With it, stroke stays constant
                regardless of size.
              </Text>
              <div className="flex items-end gap-6">
                <div className="flex flex-col items-center gap-1.5">
                  <div className="flex gap-3">
                    <div className="flex flex-col items-center gap-1">
                      <Settings className="size-4" strokeWidth={2} />
                      <Settings className="size-6" strokeWidth={2} />
                      <Settings className="size-8" strokeWidth={2} />
                    </div>
                    <div className="flex flex-col items-center gap-1">
                      <Settings
                        className="size-4"
                        strokeWidth={2}
                        absoluteStrokeWidth
                      />
                      <Settings
                        className="size-6"
                        strokeWidth={2}
                        absoluteStrokeWidth
                      />
                      <Settings
                        className="size-8"
                        strokeWidth={2}
                        absoluteStrokeWidth
                      />
                    </div>
                  </div>
                  <div className="mt-2 flex gap-3 text-[10px] text-muted-foreground">
                    <span>default</span>
                    <span>absolute</span>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Navigation Icons</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ChevronLeft className="size-4" />
                  <ChevronDown className="size-4" />
                  <ChevronUp className="size-4" />
                  <ChevronRight className="size-4" />
                </div>
                <Separator orientation="vertical" className="h-6" />
                <div className="flex items-center gap-1 text-muted-foreground">
                  <ArrowUp className="size-4" />
                  <ArrowDown className="size-4" />
                  <ArrowUpDown className="size-4" />
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="rounded-lg border border-dashed p-4">
            <Text variant="muted">
              Icons accept <Text variant="inline-code">size</Text>,{" "}
              <Text variant="inline-code">color</Text> (via className),{" "}
              <Text variant="inline-code">strokeWidth</Text>,{" "}
              <Text variant="inline-code">absoluteStrokeWidth</Text>, and all
              SVG props. To swap library: change only{" "}
              <Text variant="inline-code">packages/ui/src/lib/icons.ts</Text>.
              44 UI components import from this file.
            </Text>
          </div>
        </div>
      </section>

      <Separator className="mb-16" />

      {/* ==================== COLOR THEMES ==================== */}
      <section className="mb-16">
        <h2 className="mb-6">Color Themes</h2>
        <Text variant="muted" className="mb-8">
          Switch themes using the palette button above. Press{" "}
          <Text variant="inline-code">D</Text> to toggle dark mode.
        </Text>

        <div className="grid gap-4 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Surface Colors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <ColorSwatch name="background" />
                <ColorSwatch name="foreground" />
                <ColorSwatch name="card" />
                <ColorSwatch name="popover" />
                <ColorSwatch name="muted" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Brand Colors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <ColorSwatch name="primary" />
                <ColorSwatch name="secondary" />
                <ColorSwatch name="accent" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Semantic Colors</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <ColorSwatch name="destructive" />
                <ColorSwatch name="success" />
                <ColorSwatch name="warning" />
                <ColorSwatch name="info" />
                <ColorSwatch name="purple" />
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Chrome</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <ColorSwatch name="border" />
                <ColorSwatch name="input" />
                <ColorSwatch name="ring" />
              </div>
            </CardContent>
          </Card>
        </div>
      </section>

      <Separator className="mb-16" />

      {/* ==================== WEIGHT & SIZE MATRIX ==================== */}
      <section className="mb-16">
        <h2 className="mb-6">Weight &amp; Size Matrix</h2>

        <Card>
          <CardContent className="overflow-x-auto pt-6">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b">
                  <th className="pr-4 pb-2 font-medium text-muted-foreground">
                    Size
                  </th>
                  <th className="pr-4 pb-2 font-medium text-muted-foreground">
                    Normal (400)
                  </th>
                  <th className="pr-4 pb-2 font-medium text-muted-foreground">
                    Medium (500)
                  </th>
                  <th className="pr-4 pb-2 font-medium text-muted-foreground">
                    Semibold (600)
                  </th>
                  <th className="pb-2 font-medium text-muted-foreground">
                    Extrabold (800)
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b">
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    text-xs (12px)
                  </td>
                  <td className="py-3 pr-4 text-xs font-normal">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-xs font-medium">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-xs font-semibold">
                    The quick brown fox
                  </td>
                  <td className="py-3 text-xs font-extrabold">
                    The quick brown fox
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    text-sm (14px)
                  </td>
                  <td className="py-3 pr-4 text-sm font-normal">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-sm font-medium">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-sm font-semibold">
                    The quick brown fox
                  </td>
                  <td className="py-3 text-sm font-extrabold">
                    The quick brown fox
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    text-base (16px)
                  </td>
                  <td className="py-3 pr-4 text-base font-normal">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-base font-medium">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-base font-semibold">
                    The quick brown fox
                  </td>
                  <td className="py-3 text-base font-extrabold">
                    The quick brown fox
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    text-lg (18px)
                  </td>
                  <td className="py-3 pr-4 text-lg font-normal">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-lg font-medium">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-lg font-semibold">
                    The quick brown fox
                  </td>
                  <td className="py-3 text-lg font-extrabold">
                    The quick brown fox
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    text-xl (20px)
                  </td>
                  <td className="py-3 pr-4 text-xl font-normal">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-xl font-medium">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-xl font-semibold">
                    The quick brown fox
                  </td>
                  <td className="py-3 text-xl font-extrabold">
                    The quick brown fox
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    text-2xl (24px)
                  </td>
                  <td className="py-3 pr-4 text-2xl font-normal">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-2xl font-medium">
                    The quick brown fox
                  </td>
                  <td className="py-3 pr-4 text-2xl font-semibold">
                    The quick brown fox
                  </td>
                  <td className="py-3 text-2xl font-extrabold">
                    The quick brown fox
                  </td>
                </tr>
                <tr className="border-b">
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    text-3xl (30px)
                  </td>
                  <td className="py-3 pr-4 text-3xl font-normal">Quick fox</td>
                  <td className="py-3 pr-4 text-3xl font-medium">Quick fox</td>
                  <td className="py-3 pr-4 text-3xl font-semibold">
                    Quick fox
                  </td>
                  <td className="py-3 text-3xl font-extrabold">Quick fox</td>
                </tr>
                <tr>
                  <td className="py-3 pr-4 text-xs text-muted-foreground">
                    text-4xl (36px)
                  </td>
                  <td className="py-3 pr-4 text-4xl font-normal">Quick fox</td>
                  <td className="py-3 pr-4 text-4xl font-medium">Quick fox</td>
                  <td className="py-3 pr-4 text-4xl font-semibold">
                    Quick fox
                  </td>
                  <td className="py-3 text-4xl font-extrabold">Quick fox</td>
                </tr>
              </tbody>
            </table>
          </CardContent>
        </Card>
      </section>
    </div>
  )
}

function ColorSwatch({ name }: { name: string }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="size-8 rounded border"
        style={{ backgroundColor: `var(--${name})` }}
      />
      <span className="text-sm font-medium">{name}</span>
      <span className="font-mono text-xs text-muted-foreground">
        var(--{name})
      </span>
    </div>
  )
}
