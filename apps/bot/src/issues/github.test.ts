import { describe, expect, it, vi } from "vitest"
import { createGitHubIssueClient } from "./github.js"

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status })
}

describe("createGitHubIssueClient", () => {
  it("creates a GitHub issue and adds it to ProjectV2 fields", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        json({
          id: 456,
          node_id: "I_node",
          number: 123,
          html_url: "https://github.com/o/r/issues/123",
        }),
      )
      .mockResolvedValueOnce(
        json({ data: { addProjectV2ItemById: { item: { id: "PVTI_1" } } } }),
      )
      .mockResolvedValueOnce(
        json({
          data: {
            updateProjectV2ItemFieldValue: { projectV2Item: { id: "PVTI_1" } },
          },
        }),
      )
      .mockResolvedValueOnce(json({}, 201))

    const client = createGitHubIssueClient(
      "tok",
      "o/r",
      fetchImpl as unknown as typeof fetch,
    )
    const issue = await client.createIssue({
      title: "boom",
      body: "body",
      labels: ["bug"],
      projectId: "PVT_1",
      projectFields: [{ fieldId: "field", optionId: "option" }],
      parentIssueNumber: 99,
    })

    expect(issue).toEqual({
      id: "123",
      identifier: "#123",
      number: 123,
      restId: 456,
      url: "https://github.com/o/r/issues/123",
    })
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "https://api.github.com/repos/o/r/issues",
    )
    expect(String(fetchImpl.mock.calls[1]?.[0])).toBe(
      "https://api.github.com/graphql",
    )
    expect(String(fetchImpl.mock.calls[2]?.[0])).toBe(
      "https://api.github.com/graphql",
    )
    expect(String(fetchImpl.mock.calls[3]?.[0])).toBe(
      "https://api.github.com/repos/o/r/issues/99/sub_issues",
    )
    expect(JSON.parse(String(fetchImpl.mock.calls[3]?.[1]?.body))).toEqual({
      sub_issue_id: 456,
      replace_parent: true,
    })
  })

  it("comments on an existing issue number", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(json({}, 201))
    const client = createGitHubIssueClient(
      "tok",
      "o/r",
      fetchImpl as unknown as typeof fetch,
    )
    expect(await client.addComment("123", "again")).toBe(true)
    expect(String(fetchImpl.mock.calls[0]?.[0])).toBe(
      "https://api.github.com/repos/o/r/issues/123/comments",
    )
  })
})
