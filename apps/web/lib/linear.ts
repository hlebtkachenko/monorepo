/**
 * Minimal Linear GraphQL client.
 *
 * Used by `apps/web/app/api/feedback/bug` to post in-app bug reports
 * captured from the right-click context menu. The full Linear SDK
 * (`@linear/sdk`) is intentionally avoided — we only call one mutation
 * and don't want its ~150 KB type surface in the server bundle.
 *
 * Required env:
 *   LINEAR_API_KEY                 personal or workspace API key
 *   LINEAR_AFFRAME_TEAM_ID         AFF team id
 *
 * Optional env:
 *   LINEAR_SUPPORT_PROJECT_ID      attaches issues to a Linear project
 *
 * When `LINEAR_API_KEY` is unset, `createBugIssue` throws
 * `LinearNotConfiguredError` — the route handler converts that into a
 * 503 so the client UI can fall back to a clipboard-only flow.
 */

const LINEAR_GRAPHQL = "https://api.linear.app/graphql"
const REQUEST_TIMEOUT_MS = 10_000

export class LinearNotConfiguredError extends Error {
  constructor() {
    super("LINEAR_API_KEY or LINEAR_AFFRAME_TEAM_ID is not set")
    this.name = "LinearNotConfiguredError"
  }
}

export class LinearRequestError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LinearRequestError"
  }
}

export interface CreateBugIssueInput {
  title: string
  /** Markdown rendered into the Linear issue body. */
  description: string
}

export interface CreateBugIssueResult {
  id: string
  identifier: string
  url: string
}

const ISSUE_CREATE_MUTATION = `
  mutation IssueCreate($input: IssueCreateInput!) {
    issueCreate(input: $input) {
      success
      issue {
        id
        identifier
        url
      }
    }
  }
`

export async function createBugIssue(
  input: CreateBugIssueInput,
): Promise<CreateBugIssueResult> {
  const apiKey = process.env.LINEAR_API_KEY
  const teamId = process.env.LINEAR_AFFRAME_TEAM_ID
  const projectId = process.env.LINEAR_SUPPORT_PROJECT_ID
  if (!apiKey || !teamId) throw new LinearNotConfiguredError()

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)

  let response: Response
  try {
    response = await fetch(LINEAR_GRAPHQL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        Authorization: apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: ISSUE_CREATE_MUTATION,
        variables: {
          input: {
            teamId,
            title: input.title,
            description: input.description,
            ...(projectId ? { projectId } : {}),
          },
        },
      }),
    })
  } finally {
    clearTimeout(timer)
  }

  if (!response.ok) {
    throw new LinearRequestError(
      `Linear API ${response.status} ${response.statusText}`,
    )
  }

  const json = (await response.json()) as {
    data?: {
      issueCreate?: {
        success: boolean
        issue?: { id: string; identifier: string; url: string }
      }
    }
    errors?: Array<{ message: string }>
  }

  if (json.errors?.length) {
    throw new LinearRequestError(
      `Linear API error: ${json.errors.map((e) => e.message).join("; ")}`,
    )
  }
  const issue = json.data?.issueCreate?.issue
  if (!json.data?.issueCreate?.success || !issue) {
    throw new LinearRequestError("Linear API did not create the issue")
  }
  return issue
}
