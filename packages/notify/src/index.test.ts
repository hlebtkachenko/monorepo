import { describe, it, expect, vi } from "vitest"
import { buildIngestRequest, createNotifier, notifierFromEnv } from "./index.js"

const config = { url: "http://localhost:8787/ingest", secret: "shh" }

describe("buildIngestRequest", () => {
  it("targets the configured url with a bearer header", () => {
    const { url, init } = buildIngestRequest({ text: "hi" }, config)
    expect(url).toBe(config.url)
    expect(init.method).toBe("POST")
    expect((init.headers as Record<string, string>).authorization).toBe(
      "Bearer shh",
    )
  })

  it("serialises level, source and buttons into the body", () => {
    const { init } = buildIngestRequest(
      {
        text: "deploy?",
        level: "warn",
        source: "agent",
        buttons: ["Yes", "No"],
      },
      config,
    )
    expect(JSON.parse(init.body as string)).toEqual({
      text: "deploy?",
      level: "warn",
      source: "agent",
      buttons: ["Yes", "No"],
    })
  })
})

describe("createNotifier", () => {
  it("posts and resolves on a 2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 200 }))
    const n = createNotifier({ ...config, fetchImpl })
    await n.notify("ok")
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("alert() defaults level to error", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(JSON.parse(init!.body as string).level).toBe("error")
        return new Response(null, { status: 200 })
      },
    )
    await createNotifier({ ...config, fetchImpl }).alert("boom")
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("throws on a non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 401 }))
    await expect(
      createNotifier({ ...config, fetchImpl }).notify("x"),
    ).rejects.toThrow("401")
  })
})

describe("ask / answer", () => {
  it("ask posts to the /ask sibling of the ingest url and returns the id", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("http://localhost:8787/ask")
      return new Response(JSON.stringify({ id: "abc", exp: 99 }), {
        status: 200,
      })
    })
    const out = await createNotifier({ ...config, fetchImpl }).ask({
      question: "Merge?",
      options: ["Yes", "No"],
    })
    expect(out).toEqual({ id: "abc", exp: 99 })
  })

  it("answer GETs /answer/:id and returns the decision state", async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      expect(String(url)).toBe("http://localhost:8787/answer/abc")
      return new Response(
        JSON.stringify({
          id: "abc",
          decision: "Yes",
          pending: false,
          expired: false,
          options: ["Yes", "No"],
        }),
        { status: 200 },
      )
    })
    const state = await createNotifier({ ...config, fetchImpl }).answer("abc")
    expect(state.decision).toBe("Yes")
    expect(state.pending).toBe(false)
  })

  it("ask throws on a non-2xx", async () => {
    const fetchImpl = vi.fn(async () => new Response(null, { status: 500 }))
    await expect(
      createNotifier({ ...config, fetchImpl }).ask({ question: "x" }),
    ).rejects.toThrow("500")
  })

  it("askConfirm posts Accept/Reject + allowCustom", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        const b = JSON.parse(init!.body as string)
        expect(b.kind).toBe("choice")
        expect(b.options).toEqual(["Ship", "Hold"])
        expect(b.allowCustom).toBe(true)
        return new Response(JSON.stringify({ id: "c1", exp: 9 }), {
          status: 200,
        })
      },
    )
    await createNotifier({ ...config, fetchImpl }).askConfirm("Deploy?", {
      accept: "Ship",
      reject: "Hold",
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("askText posts kind=text", async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, init?: RequestInit) => {
        expect(JSON.parse(init!.body as string).kind).toBe("text")
        return new Response(JSON.stringify({ id: "t1", exp: 9 }), {
          status: 200,
        })
      },
    )
    await createNotifier({ ...config, fetchImpl }).askText("notes?", {
      asker: "agent-x",
    })
    expect(fetchImpl).toHaveBeenCalledOnce()
  })

  it("waitForAnswer polls until answered", async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      const answered = calls >= 2
      return new Response(
        JSON.stringify({
          id: "w1",
          kind: "choice",
          decision: answered ? "Approve" : null,
          text: null,
          answered,
          pending: !answered,
          expired: false,
          timedOut: false,
          options: ["Approve", "Reject"],
        }),
        { status: 200 },
      )
    })
    const state = await createNotifier({ ...config, fetchImpl }).waitForAnswer(
      "w1",
      { intervalMs: 1 },
    )
    expect(state.decision).toBe("Approve")
    expect(calls).toBe(2)
  })
})

describe("notifierFromEnv", () => {
  it("returns null when unconfigured", () => {
    expect(notifierFromEnv({})).toBeNull()
  })

  it("builds a notifier when both vars are present", () => {
    const n = notifierFromEnv({
      BOT_INGEST_URL: config.url,
      NOTIFY_SHARED_SECRET: "s",
    })
    expect(n).not.toBeNull()
  })
})
