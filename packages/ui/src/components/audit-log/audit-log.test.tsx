import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it } from "vitest"

import {
  AuditLog,
  AuditLogAction,
  AuditLogActor,
  AuditLogDetail,
  AuditLogField,
  AuditLogItem,
  AuditLogTrigger,
} from "./audit-log"

describe("AuditLog", () => {
  it("reveals structured details", async () => {
    const user = userEvent.setup()
    render(
      <AuditLog>
        <AuditLogItem>
          <AuditLogTrigger>
            <AuditLogActor>Agent</AuditLogActor>
            <AuditLogAction>updated record</AuditLogAction>
          </AuditLogTrigger>
          <AuditLogDetail>
            <AuditLogField label="Request">req_123</AuditLogField>
          </AuditLogDetail>
        </AuditLogItem>
      </AuditLog>,
    )
    expect(screen.queryByText("req_123")).not.toBeInTheDocument()
    await user.click(screen.getByRole("button"))
    expect(screen.getByText("req_123")).toBeVisible()
  })
})
