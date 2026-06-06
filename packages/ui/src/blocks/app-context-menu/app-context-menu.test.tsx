import { render, screen, fireEvent, act, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, it, expect, vi, beforeEach } from "vitest"

import { AppContextMenu } from "./app-context-menu"
import {
  buildBugReport,
  captureContext,
  formatAboutBlock,
  formatAskSidekick,
  formatCopyPath,
  guessPageFile,
  BUG_REPORT_TYPES,
} from "./lib/capture-context"

const SAMPLE_PATHNAME = "/acme/dashboard"

function buildSampleCtx() {
  return captureContext({
    target: null,
    selectionText: "hello world",
    pathname: SAMPLE_PATHNAME,
    orgSlug: "acme",
    user: { id: "u_1", email: "u@x" },
  })
}

describe("captureContext", () => {
  it("extracts element + selection + scope", () => {
    document.body.innerHTML = `
      <section data-slot="kpi-tile">
        <h2 id="rev">Revenue</h2>
        <p>123 456 Kč</p>
      </section>
    `
    const target = document.querySelector("#rev") as HTMLElement
    const ctx = captureContext({
      target,
      selectionText: "Revenue",
      pathname: SAMPLE_PATHNAME,
      orgSlug: "acme",
      user: { id: "u_1", email: "u@x" },
    })
    expect(ctx.version).toBe(1)
    expect(ctx.element.tag).toBe("h2")
    expect(ctx.element.id).toBe("rev")
    expect(ctx.element.text).toBe("Revenue")
    expect(ctx.element.dom_path).toContain('section[data-slot="kpi-tile"]')
    expect(ctx.surrounding.inferred_block).toBe("kpi-tile")
    expect(ctx.surrounding.nearby_text).toContain("Revenue")
    expect(ctx.selection.text).toBe("Revenue")
    expect(ctx.scope.org_slug).toBe("acme")
    expect(ctx.scope.user?.email).toBe("u@x")
    expect(ctx.page.pathname).toBe(SAMPLE_PATHNAME)
  })
})

describe("guessPageFile", () => {
  it("maps known route shapes to app-router files", () => {
    expect(guessPageFile("/")).toBe("apps/web/app/page.tsx")
    expect(guessPageFile("/acme")).toBe("apps/web/app/[orgSlug]/page.tsx")
    expect(guessPageFile("/acme/documents/invoices-received")).toBe(
      "apps/web/app/[orgSlug]/documents/invoices-received/page.tsx",
    )
    expect(guessPageFile("/workspace")).toBe("apps/web/app/workspace/page.tsx")
    expect(guessPageFile("/workspace/inbox")).toBe(
      "apps/web/app/workspace/inbox/page.tsx",
    )
    expect(guessPageFile("/api/feedback/bug")).toBe(
      "apps/web/app/api/feedback/bug/route.ts",
    )
  })
})

describe("clipboard formatters", () => {
  it("formatAskSidekick wraps a fenced JSON block + question prompt", () => {
    const out = formatAskSidekick(buildSampleCtx())
    expect(out).toContain("Sidekick")
    expect(out).toContain("```json")
    expect(out).toContain('"kind": "sidekick.ask"')
    expect(out).toContain('"user_question": ""')
    expect(out).toContain("Question (fill this in")
  })

  it("formatAboutBlock includes auto-derived query + JSON", () => {
    const out = formatAboutBlock(buildSampleCtx())
    expect(out).toContain("Search query:")
    expect(out).toContain('"kind": "docs.search"')
  })

  it("formatCopyPath includes repo + likely_file + task placeholder", () => {
    const out = formatCopyPath(buildSampleCtx())
    expect(out).toContain('"kind": "agent.copy_path"')
    expect(out).toContain('"working_directory"')
    expect(out).toContain('"likely_file"')
    expect(out).toContain("Task (fill in")
  })

  it("buildBugReport carries type + message + email + auto_title", () => {
    const out = buildBugReport({
      ctx: buildSampleCtx(),
      type: "issue",
      message: "Modal hard to close",
      email: "  reply@x  ",
    })
    expect(out.kind).toBe("bug.report")
    expect(out.type).toBe("issue")
    expect(out.message).toBe("Modal hard to close")
    expect(out.email).toBe("reply@x")
    expect(out.auto_title).toContain("[issue]")
    expect(out.auto_title).toContain(SAMPLE_PATHNAME)
  })

  it("buildBugReport coerces empty email to null", () => {
    const out = buildBugReport({
      ctx: buildSampleCtx(),
      type: "bug",
      message: "x",
      email: "",
    })
    expect(out.email).toBeNull()
  })
})

describe("BUG_REPORT_TYPES", () => {
  it("exposes the public-API enum values", () => {
    const values = BUG_REPORT_TYPES.map((t) => t.value).sort()
    expect(values).toEqual(["bug", "issue", "question", "request"])
  })
})

describe("AppContextMenu", () => {
  beforeEach(() => {
    // jsdom marks `navigator.clipboard` as a getter-only property in
    // some versions — `Object.assign` throws. defineProperty with
    // `configurable: true` lets the same handle survive across tests.
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
      writable: true,
    })
  })

  it("renders children inside the trigger", () => {
    render(
      <AppContextMenu pathname={SAMPLE_PATHNAME}>
        <p data-testid="child">hi</p>
      </AppContextMenu>,
    )
    expect(screen.getByTestId("child")).toBeInTheDocument()
    expect(
      document.querySelector("[data-slot='app-context-menu-trigger']"),
    ).toBeTruthy()
  })

  it("opens menu with flat structure (no submenu)", () => {
    render(
      <AppContextMenu pathname={SAMPLE_PATHNAME}>
        <p>hi</p>
      </AppContextMenu>,
    )
    const trigger = document.querySelector(
      "[data-slot='app-context-menu-trigger']",
    ) as HTMLElement
    act(() => {
      fireEvent.contextMenu(trigger, { clientX: 10, clientY: 10 })
    })
    // All four actions visible at top level — Report bug + Copy path
    // are listed flat under the Feedback Tools label, no submenu.
    expect(
      screen.getByRole("menuitem", { name: /Ask Sidekick/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("menuitem", { name: /About this block/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("menuitem", { name: /Report bug/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole("menuitem", { name: /Copy path/i }),
    ).toBeInTheDocument()
    // No submenu trigger element should exist.
    expect(
      document.querySelector("[data-slot='context-menu-sub-trigger']"),
    ).toBeNull()
  })

  it("opens the bug-report dialog when Report bug clicked", async () => {
    const user = userEvent.setup()
    render(
      <AppContextMenu pathname={SAMPLE_PATHNAME}>
        <p>hi</p>
      </AppContextMenu>,
    )
    const trigger = document.querySelector(
      "[data-slot='app-context-menu-trigger']",
    ) as HTMLElement
    act(() => {
      fireEvent.contextMenu(trigger, { clientX: 10, clientY: 10 })
    })
    await user.click(screen.getByRole("menuitem", { name: /Report bug/i }))
    await waitFor(() => {
      expect(
        document.querySelector("[data-slot='bug-report-dialog']"),
      ).toBeTruthy()
    })
    expect(
      screen.getByRole("heading", { name: /Send feedback/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/Page context is auto-attached/i),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/Type/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Message/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/Reply email/i)).toBeInTheDocument()
  })

  it("pre-fills reply email from user prop", async () => {
    const user = userEvent.setup()
    render(
      <AppContextMenu
        pathname={SAMPLE_PATHNAME}
        user={{ id: "u", email: "me@x.test" }}
      >
        <p>hi</p>
      </AppContextMenu>,
    )
    const trigger = document.querySelector(
      "[data-slot='app-context-menu-trigger']",
    ) as HTMLElement
    act(() => {
      fireEvent.contextMenu(trigger, { clientX: 10, clientY: 10 })
    })
    await user.click(screen.getByRole("menuitem", { name: /Report bug/i }))
    const emailInput = await screen.findByLabelText(/Reply email/i)
    expect(emailInput).toHaveValue("me@x.test")
  })

  it("posts the structured payload via onReportBug on submit", async () => {
    const user = userEvent.setup()
    const onReportBug = vi.fn().mockResolvedValue({
      url: "https://linear.app/x/AFF-1",
      identifier: "AFF-1",
    })
    render(
      <AppContextMenu
        pathname={SAMPLE_PATHNAME}
        user={{ id: "u", email: "me@x.test" }}
        onReportBug={onReportBug}
      >
        <p>hi</p>
      </AppContextMenu>,
    )
    const trigger = document.querySelector(
      "[data-slot='app-context-menu-trigger']",
    ) as HTMLElement
    act(() => {
      fireEvent.contextMenu(trigger, { clientX: 10, clientY: 10 })
    })
    await user.click(screen.getByRole("menuitem", { name: /Report bug/i }))
    const textarea = await screen.findByLabelText(/Message/i)
    await user.type(textarea, "found a glitch")
    await user.click(screen.getByRole("button", { name: /Send feedback/i }))
    await waitFor(() => expect(onReportBug).toHaveBeenCalledTimes(1))
    const arg = onReportBug.mock.calls[0]![0] as {
      kind: string
      type: string
      message: string
      email: string | null
    }
    expect(arg.kind).toBe("bug.report")
    expect(arg.type).toBe("bug")
    expect(arg.message).toBe("found a glitch")
    expect(arg.email).toBe("me@x.test")
  })
})
