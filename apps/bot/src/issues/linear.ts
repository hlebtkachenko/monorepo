// Minimal Linear GraphQL client for the Worker. Mirrors the call shape in
// apps/api/src/v1/feedback/feedback.controller.ts (raw `authorization: <token>`, no Bearer),
// but returns the created issue and adds commentCreate for the dedup-bump path.

const ISSUE_CREATE = `mutation IssueCreate($input: IssueCreateInput!) {
  issueCreate(input: $input) { success issue { id identifier url } }
}`

const COMMENT_CREATE = `mutation CommentCreate($input: CommentCreateInput!) {
  commentCreate(input: $input) { success }
}`

export interface CreatedIssue {
  id: string
  identifier: string
  url: string
}

export interface CreateIssueInput {
  teamId: string
  projectId: string
  title: string
  description: string
  labelIds: string[]
}

export interface LinearClient {
  createIssue(input: CreateIssueInput): Promise<CreatedIssue | null>
  addComment(issueId: string, body: string): Promise<boolean>
}

export function createLinearClient(
  token: string,
  fetchImpl: typeof fetch = fetch,
): LinearClient {
  async function gql<T>(query: string, variables: unknown): Promise<T | null> {
    try {
      const res = await fetchImpl("https://api.linear.app/graphql", {
        method: "POST",
        headers: { authorization: token, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
      })
      if (!res.ok) return null
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  return {
    async createIssue(input) {
      const json = await gql<{
        data?: { issueCreate?: { issue?: CreatedIssue } }
      }>(ISSUE_CREATE, { input })
      return json?.data?.issueCreate?.issue ?? null
    },
    async addComment(issueId, body) {
      const json = await gql<{
        data?: { commentCreate?: { success: boolean } }
      }>(COMMENT_CREATE, {
        input: { issueId, body },
      })
      return json?.data?.commentCreate?.success ?? false
    },
  }
}
