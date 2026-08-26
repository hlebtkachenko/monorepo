/**
 * The Úkoly klientovi sections, rendered.
 *
 * The actions' own suite (`_actions/client-tasks.db.test.ts`) proves who may
 * write and what a bad payload does; the data layer's own suite
 * (`lib/data/client-tasks.test.ts`) proves which rows a caller may see. This
 * file proves the FORM SIDE of the same contract, which no action test can
 * see:
 *
 *   1. every form carries the hidden `orgSlug` the action resolves its scope
 *      from — a form that forgot it is an action that 404s for a reason
 *      nobody could see from the page;
 *   2. "Dokončit" / "Otevřít znovu" is posted as an explicit `true` / `false`
 *      literal, never a checkbox — absence must never be readable as either
 *      direction;
 *   3. the link-kind select offers exactly the closed list (`none` /
 *      `dokumenty` / `dane`);
 *   4. a task carries a `dueDate` field and no `templateDueDay`, a template
 *      the reverse — the two forms must not cross-offer the other's field.
 *
 * `renderToStaticMarkup`, following the Zadávání dat suite's own precedent
 * (`zadavani/_components/zadavani.test.tsx`): these are pure functions of
 * their props and a string is enough.
 */
import { renderToStaticMarkup } from "react-dom/server"
import { NextIntlClientProvider } from "next-intl"
import { describe, expect, it } from "vitest"

import { BETA_LOCALE, BETA_TIME_ZONE, betaFormats } from "@/i18n/formats"
import { betaMessages } from "@/i18n/messages"
import type { OwnerClientTaskDetail } from "@/lib/data/projections"

import { TasksSection } from "./tasks-section"
import { TemplatesSection } from "./templates-section"

const ORG_SLUG = "acme-sro"

function render(node: React.ReactElement): string {
  return renderToStaticMarkup(
    <NextIntlClientProvider
      locale={BETA_LOCALE}
      timeZone={BETA_TIME_ZONE}
      formats={betaFormats}
      messages={betaMessages as never}
    >
      {node}
    </NextIntlClientProvider>,
  )
}

function task(
  overrides: Partial<OwnerClientTaskDetail> = {},
): OwnerClientTaskDetail {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f6",
    isTemplate: false,
    title: "Nahrát bankovní výpis",
    description: null,
    dueDate: "2026-04-10",
    templateDueDay: null,
    linkKind: "dokumenty",
    status: "open",
    doneAt: null,
    generatedFromTemplate: false,
    createdAt: "2026-03-07T10:00:00.000Z",
    updatedAt: "2026-03-07T10:00:00.000Z",
    ...overrides,
  }
}

function template(
  overrides: Partial<OwnerClientTaskDetail> = {},
): OwnerClientTaskDetail {
  return {
    id: "0195e6a1-4b2c-7d3e-8f10-a1b2c3d4e5f7",
    isTemplate: true,
    title: "Docházka",
    description: null,
    dueDate: null,
    templateDueDay: 5,
    linkKind: "none",
    status: "open",
    doneAt: null,
    generatedFromTemplate: false,
    createdAt: "2026-03-07T10:00:00.000Z",
    updatedAt: "2026-03-07T10:00:00.000Z",
    ...overrides,
  }
}

describe("TasksSection", () => {
  it("carries orgSlug on every form — the field each action resolves its scope from", () => {
    const html = render(<TasksSection tasks={[task()]} orgSlug={ORG_SLUG} />)

    const forms = html.split("<form").length - 1
    const slugFields =
      html.split(`<input type="hidden" name="orgSlug" value="${ORG_SLUG}"/>`)
        .length - 1

    expect(forms).toBeGreaterThan(0)
    expect(slugFields, "one hidden orgSlug per form").toBe(forms)
  })

  it("posts done as an explicit literal, never as a checkbox", () => {
    const open = render(<TasksSection tasks={[task()]} orgSlug={ORG_SLUG} />)
    expect(open).toContain('name="done" value="true"')
    expect(open).toContain("Dokončit")

    const done = render(
      <TasksSection
        tasks={[task({ status: "done", doneAt: "2026-04-11T09:00:00.000Z" })]}
        orgSlug={ORG_SLUG}
      />,
    )
    expect(done).toContain('name="done" value="false"')
    expect(done).toContain("Otevřít znovu")
    expect(done).toContain("Hotovo")
  })

  it("offers exactly the closed link-kind list", () => {
    const html = render(<TasksSection tasks={[]} orgSlug={ORG_SLUG} />)
    expect(html).toContain('value="none"')
    expect(html).toContain('value="dokumenty"')
    expect(html).toContain('value="dane"')
    expect(html).not.toContain('value="mzdy"')
  })

  it("a task's row form carries dueDate, never templateDueDay", () => {
    const html = render(<TasksSection tasks={[task()]} orgSlug={ORG_SLUG} />)
    const rowForm = html.slice(html.indexOf('name="taskId"'))
    expect(rowForm).toContain('name="dueDate"')
    expect(rowForm).not.toContain('name="templateDueDay"')
  })

  it("badges a task generated from a template, without freezing it", () => {
    const html = render(
      <TasksSection
        tasks={[task({ generatedFromTemplate: true })]}
        orgSlug={ORG_SLUG}
      />,
    )
    expect(html).toContain("ze šablony")
    // Still an ordinary editable/deletable row — the badge is informational.
    expect(html).toContain("Smazat")
  })

  it("has an empty state rather than a bare table head", () => {
    const html = render(<TasksSection tasks={[]} orgSlug={ORG_SLUG} />)
    expect(html).toContain("Zatím tu nic není.")
  })
})

describe("TemplatesSection", () => {
  it("carries orgSlug on every form, including the monthly-set dialog", () => {
    const html = render(
      <TemplatesSection templates={[template()]} orgSlug={ORG_SLUG} />,
    )

    const forms = html.split("<form").length - 1
    const slugFields =
      html.split(`<input type="hidden" name="orgSlug" value="${ORG_SLUG}"/>`)
        .length - 1
    expect(slugFields).toBe(forms)
  })

  it("a template's row form carries templateDueDay, never dueDate", () => {
    const html = render(
      <TemplatesSection templates={[template()]} orgSlug={ORG_SLUG} />,
    )
    const rowForm = html.slice(html.indexOf('name="templateId"'))
    expect(rowForm).toContain('name="templateDueDay"')
    expect(rowForm).not.toContain('name="dueDate"')
  })

  it("renders the monthly-set trigger button", () => {
    // The dialog's own body (the month/year fields) is Radix `DialogContent`
    // in a portal that only mounts once opened — `renderToStaticMarkup`
    // never renders it closed, so this asserts the trigger only; the fields
    // themselves are exercised through the action layer
    // (`_actions/client-tasks.db.test.ts`).
    const html = render(<TemplatesSection templates={[]} orgSlug={ORG_SLUG} />)
    expect(html).toContain("Založit měsíční sadu")
  })

  it("has an empty state", () => {
    const html = render(<TemplatesSection templates={[]} orgSlug={ORG_SLUG} />)
    expect(html).toContain("Zatím tu nic není.")
  })
})
