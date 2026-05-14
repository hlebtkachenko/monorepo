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
              <p className="font-heading text-lg">Geist</p>
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
              <p className="font-mono text-lg">Geist Mono</p>
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
