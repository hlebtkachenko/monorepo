import { ghFetch, ghHeaders } from "../github.js"

const API = "https://api.github.com"
const GRAPHQL = "https://api.github.com/graphql"

export interface CreatedIssue {
  /** GitHub issue number (`#123` shown to humans; the REST comment path keys off it). */
  number: number
  /** GitHub's internal REST id — only used to attach the issue as a sub-issue. */
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
  const headers = ghHeaders(token)

  async function graphql<T>(
    query: string,
    variables: Record<string, unknown>,
  ): Promise<T | null> {
    const res = await ghFetch(fetchImpl, GRAPHQL, {
      method: "POST",
      headers: { ...headers, "content-type": "application/json" },
      body: JSON.stringify({ query, variables }),
    })
    if (!res?.ok) return null
    const json = (await res.json()) as T & { errors?: unknown[] }
    // GitHub GraphQL reports failures as 200-with-`errors`. Treat that as a miss so a
    // wrong fieldId/optionId degrades to "no Project fields", not a silent success.
    if (Array.isArray(json.errors) && json.errors.length > 0) return null
    return json
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
    // Sub-issues are hierarchy metadata. Issue creation and Project fields still stand
    // if GitHub rejects the hierarchy write because the token lacks that permission —
    // ghFetch swallows the failure to null and we ignore the result.
    await ghFetch(
      fetchImpl,
      `${API}/repos/${repo}/issues/${parentIssueNumber}/sub_issues`,
      {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          sub_issue_id: subIssueRestId,
          replace_parent: true,
        }),
      },
    )
  }

  return {
    async createIssue(input) {
      const res = await ghFetch(fetchImpl, `${API}/repos/${repo}/issues`, {
        method: "POST",
        headers: { ...headers, "content-type": "application/json" },
        body: JSON.stringify({
          title: input.title,
          body: input.body,
          labels: input.labels,
        }),
      })
      if (!res?.ok) return null
      let issue: IssueRow
      try {
        issue = (await res.json()) as IssueRow
      } catch {
        return null
      }
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
        number: issue.number,
        restId: issue.id,
        url: issue.html_url,
      }
    },
    async addComment(issueId, body) {
      const res = await ghFetch(
        fetchImpl,
        `${API}/repos/${repo}/issues/${encodeURIComponent(issueId)}/comments`,
        {
          method: "POST",
          headers: { ...headers, "content-type": "application/json" },
          body: JSON.stringify({ body }),
        },
      )
      return res?.ok ?? false
    },
  }
}
