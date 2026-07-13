import type { Meta, StoryObj } from "@storybook/react"

import {
  AuditLog,
  AuditLogAction,
  AuditLogActor,
  AuditLogDetail,
  AuditLogField,
  AuditLogItem,
  AuditLogStatus,
  AuditLogTime,
  AuditLogTrigger,
} from "./audit-log"

const meta: Meta<typeof AuditLog> = {
  title: "Components/AuditLog",
  component: AuditLog,
}
export default meta
type Story = StoryObj<typeof AuditLog>

export const Default: Story = {
  render: () => (
    <AuditLog className="w-[42rem]">
      <AuditLogItem defaultOpen>
        <AuditLogTrigger>
          <AuditLogActor>Hleb</AuditLogActor>
          <AuditLogAction>approved invoice INV-2026-1042</AuditLogAction>
          <AuditLogStatus tone="success">Success</AuditLogStatus>
          <AuditLogTime dateTime="2026-07-13T10:30:00Z">10:30</AuditLogTime>
        </AuditLogTrigger>
        <AuditLogDetail>
          <AuditLogField label="Request">req_01JZ8</AuditLogField>
          <AuditLogField label="IP address">192.0.2.1</AuditLogField>
        </AuditLogDetail>
      </AuditLogItem>
    </AuditLog>
  ),
}

export const Warning: Story = {
  render: () => (
    <AuditLog>
      <AuditLogItem>
        <AuditLogTrigger>
          <AuditLogActor>Agent</AuditLogActor>
          <AuditLogAction>requested elevated access</AuditLogAction>
          <AuditLogStatus tone="warning">Review</AuditLogStatus>
        </AuditLogTrigger>
      </AuditLogItem>
    </AuditLog>
  ),
}

export const Success: Story = {
  render: () => (
    <AuditLog>
      <AuditLogItem>
        <AuditLogTrigger>
          <AuditLogActor>Reviewer</AuditLogActor>
          <AuditLogAction>approved a controlled action</AuditLogAction>
          <AuditLogStatus tone="success">Approved</AuditLogStatus>
        </AuditLogTrigger>
      </AuditLogItem>
    </AuditLog>
  ),
}

export const Danger: Story = {
  render: () => (
    <AuditLog>
      <AuditLogItem>
        <AuditLogTrigger>
          <AuditLogActor>System</AuditLogActor>
          <AuditLogAction>rejected an invalid API key</AuditLogAction>
          <AuditLogStatus tone="danger">Denied</AuditLogStatus>
        </AuditLogTrigger>
      </AuditLogItem>
    </AuditLog>
  ),
}

export const ToneSuccess = Success
export const ToneWarning = Warning
export const ToneDanger = Danger
