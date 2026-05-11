import type { Meta, StoryObj } from "@storybook/react"
import { WebhookTester } from "./webhook-tester"
import type { WebhookRequest, WebhookResponse } from "./webhook-tester"

const meta: Meta<typeof WebhookTester> = {
  title: "Components/WebhookTester",
  component: WebhookTester,
}
export default meta
type Story = StoryObj<typeof WebhookTester>

function mockSuccess(req: WebhookRequest): Promise<WebhookResponse> {
  return Promise.resolve({
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: { received: true, method: req.method, url: req.url },
    timing: 142,
  })
}

function mockClientError(): Promise<WebhookResponse> {
  return Promise.resolve({
    status: 422,
    statusText: "Unprocessable Entity",
    headers: { "content-type": "application/json" },
    body: { error: "Invalid payload", field: "user_id" },
    timing: 88,
  })
}

function mockServerError(): Promise<WebhookResponse> {
  return Promise.resolve({
    status: 500,
    statusText: "Internal Server Error",
    headers: {},
    body: { error: "Unhandled exception" },
    timing: 312,
  })
}

function mockNetworkFailure(): Promise<WebhookResponse> {
  return Promise.reject(new Error("Failed to fetch"))
}

export const Default: Story = {
  args: { onSend: mockSuccess },
}

export const GetMethod: Story = {
  args: { onSend: mockSuccess, defaultMethod: "GET" },
}

export const WithDefaultUrl: Story = {
  args: {
    onSend: mockSuccess,
    defaultUrl: "https://api.example.com/v1/webhooks/test",
  },
}

export const ClientErrorResponse: Story = {
  args: { onSend: mockClientError, defaultUrl: "https://api.example.com/x" },
}

export const ServerErrorResponse: Story = {
  args: { onSend: mockServerError, defaultUrl: "https://api.example.com/x" },
}

export const NetworkFailure: Story = {
  args: { onSend: mockNetworkFailure, defaultUrl: "https://api.example.com/x" },
}
