import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"

import {
  Attachment,
  AttachmentContent,
  AttachmentDescription,
  AttachmentTitle,
} from "./attachment"

describe("Attachment", () => {
  it("renders file metadata and state", () => {
    render(
      <Attachment state="uploading" data-testid="attachment">
        <AttachmentContent>
          <AttachmentTitle>invoice.pdf</AttachmentTitle>
          <AttachmentDescription>42 KB</AttachmentDescription>
        </AttachmentContent>
      </Attachment>,
    )
    expect(screen.getByTestId("attachment")).toHaveAttribute(
      "data-state",
      "uploading",
    )
    expect(screen.getByText("invoice.pdf")).toBeInTheDocument()
  })
})
