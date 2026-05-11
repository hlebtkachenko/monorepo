import type { Meta, StoryObj } from "@storybook/react"
import { ApiResponseViewer } from "./api-response-viewer"

const meta: Meta<typeof ApiResponseViewer> = {
  title: "Components/ApiResponseViewer",
  component: ApiResponseViewer,
}
export default meta
type Story = StoryObj<typeof ApiResponseViewer>

const fullResponse = {
  status: 200,
  statusText: "OK",
  headers: {
    "content-type": "application/json",
    "x-request-id": "req_01HZ8K5N",
    "cache-control": "no-store",
  },
  body: {
    id: 42,
    user: { name: "Hleb", role: "admin" },
    permissions: ["read", "write"],
  },
  timing: { dns: 12, connect: 24, ttfb: 86, download: 18, total: 140 },
}

export const Default: Story = {
  args: { response: fullResponse },
}

export const Success200: Story = {
  args: { response: { status: 200, statusText: "OK", body: { ok: true } } },
}

export const Created201: Story = {
  args: { response: { status: 201, statusText: "Created", body: { id: 7 } } },
}

export const Redirect302: Story = {
  args: {
    response: {
      status: 302,
      statusText: "Found",
      headers: { location: "/login" },
    },
  },
}

export const ClientError404: Story = {
  args: {
    response: {
      status: 404,
      statusText: "Not Found",
      body: { error: "User not found" },
    },
  },
}

export const ServerError500: Story = {
  args: {
    response: {
      status: 500,
      statusText: "Internal Server Error",
      body: { error: "Unexpected failure", trace: "/api/handler:42" },
    },
  },
}

export const HeadersTabDefault: Story = {
  args: { response: fullResponse, defaultTab: "headers" },
}

export const TimingTabDefault: Story = {
  args: { response: fullResponse, defaultTab: "timing" },
}
