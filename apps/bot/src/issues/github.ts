const API = "https://api.github.com"
const GRAPHQL = "https://api.github.com/graphql"

export interface CreatedIssue {
  id: string
  identifier: string
  number: number
  restId: number
  url: string
}

export interface ProjectFieldValue {
  fieldId: string
  optionId: string
}

export interface CreateIssueInput {
  title: string
  body: string
  labels: string[]
  projectId?: string
  projectFields?: ProjectFieldValue[]
  parentIssueNumber?: number
}

export interface GitHubIssueClient {
  createIssue(input: CreateIssueInput): Promise<CreatedIssue | null>
  addComment(issueId: string, body: string): Promise<boolean>
}

interface IssueRow {
  id: number
  node_id: string
  number: number
  html_url: string
}

interface GraphqlAddProjectItem {
  data?: { addProjectV2ItemById?: { item?: { id?: string } } }
}

interface GraphqlUpdateField {
  data?: { updateProjectV2ItemFieldValue?: { projectV2Item?: { id: string } } }
}

export function createGitHubIssueClient(
  token: string,
  repo: string,
  fetchImpl: typeof fetch = fetch,
): GitHubIssueClient {
  const headers = {
    authorization: `Bearer ${token}`,
    accept: "application/vnd.github+json",
    "x-github-api-version": "2022-11-28",
    "user-agent": "afframe-bot",
  }

  async function graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T | null> {
    try {
      const res = await fetchImpl(GRAPHQL, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({ query, variables }),
        signal: AbortSignal.timeout(8000),
      })
      if (!res.ok) return null
      return (await res.json()) as T
    } catch {
      return null
    }
  }

  async function addToProject(
    projectId: string,
    contentId: string,
    fields: ProjectFieldValue[],
  ): Promise<void> {
    const added = await graphql<GraphqlAddProjectItem>(
      `
        mutation AddIssueToProject($projectId: ID!, $contentId: ID!) {
          addProjectV2ItemById(
            input: { projectId: $projectId, contentId: $contentId }
          ) {
            item {
              id
            }
          }
        }
      `,
      { projectId, contentId },
    )
    const itemId = added?.data?.addProjectV2ItemById?.item?.id
    if (!itemId) return
    await Promise.all(
      fields.map((field) =>
        graphql<GraphqlUpdateField>(
          `
            mutation SetProjectField(
              $projectId: ID!
              $itemId: ID!
              $fieldId: ID!
              $optionId: String!
            ) {
              updateProjectV2ItemFieldValue(
                input: {
                  projectId: $projectId
                  itemId: $itemId
                  fieldId: $fieldId
                  value: { singleSelectOptionId: $optionId }
                }
              ) {
                projectV2Item {
                  id
                }
              }
            }
          `,
          {
            projectId,
            itemId,
            fieldId: field.fieldId,
            optionId: field.optionId,
          },
        ),
      ),
    )
  }

  async function addSubIssue(
    parentIssueNumber: number,
    subIssueRestId: number,
  ): Promise<void> {
    try {
      await fetchImpl(
        `${API}/repos/${repo}/issues/${parentIssueNumber}/sub_issues`,
        {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            sub_issue_id: subIssueRestId,
            replace_parent: true,
          }),
          signal: AbortSignal.timeout(8000),
        },
      )
    } catch {
      // Sub-issues are hierarchy metadata. Issue creation and Project fields still stand
      // if GitHub rejects the hierarchy write because the token lacks that permission.
    }
  }

  return {
    async createIssue(input) {
      try {
        const res = await fetchImpl(`${API}/repos/${repo}/issues`, {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({
            title: input.title,
            body: input.body,
            labels: input.labels,
          }),
          signal: AbortSignal.timeout(8000),
        })
        if (!res.ok) return null
        const issue = (await res.json()) as IssueRow
        if (input.projectId) {
          await addToProject(
            input.projectId,
            issue.node_id,
            input.projectFields ?? [],
          )
        }
        if (input.parentIssueNumber) {
          await addSubIssue(input.parentIssueNumber, issue.id)
        }
        return {
          id: String(issue.number),
          identifier: `#${issue.number}`,
          number: issue.number,
          restId: issue.id,
          url: issue.html_url,
        }
      } catch {
        return null
      }
    },
    async addComment(issueId, body) {
      try {
        const res = await fetchImpl(
          `${API}/repos/${repo}/issues/${encodeURIComponent(issueId)}/comments`,
          {
            method: "POST",
            headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify({ body }),
            signal: AbortSignal.timeout(8000),
          },
        )
        return res.ok
      } catch {
        return false
      }
    },
  }
}
