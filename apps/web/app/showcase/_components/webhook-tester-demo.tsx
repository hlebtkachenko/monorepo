"use client"

import {
  WebhookTester,
  type WebhookRequest,
  type WebhookResponse,
} from "@workspace/ui/components/webhook-tester"

async function mockSend(req: WebhookRequest): Promise<WebhookResponse> {
  await new Promise((r) => setTimeout(r, 250))
  return {
    status: 200,
    statusText: "OK",
    headers: { "content-type": "application/json" },
    body: {
      received: true,
      method: req.method,
      url: req.url,
      headerKeys: Object.keys(req.headers),
      bodyEcho: req.body ? JSON.parse(req.body || "null") : null,
    },
    timing: 142,
  }
}

export function WebhookTesterDemo() {
  return (
    <WebhookTester
      onSend={mockSend}
      defaultUrl="https://api.example.com/webhooks/test"
    />
  )
}
