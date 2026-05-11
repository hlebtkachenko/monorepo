import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"

import {
  type Prompt,
  PromptLibrary,
  PromptLibraryCategory,
  PromptLibraryContent,
  PromptLibraryEmpty,
  PromptLibraryItem,
  PromptLibraryList,
  PromptLibrarySearch,
  PromptLibraryTrigger,
} from "./prompt-library"

const PROMPTS: Prompt[] = [
  {
    id: "review",
    title: "Code Review",
    description: "Review code",
    prompt: "Review the following code...",
    category: "Development",
  },
  {
    id: "summarize",
    title: "Summarize Text",
    description: "Summarize long text",
    prompt: "Summarize the following text...",
    category: "Writing",
  },
]

function Composed({ prompts = PROMPTS }: { prompts?: Prompt[] }) {
  return (
    <PromptLibrary prompts={prompts}>
      <PromptLibraryTrigger />
      <PromptLibraryContent>
        <PromptLibrarySearch />
        <PromptLibraryList>
          <PromptLibraryEmpty>No prompts.</PromptLibraryEmpty>
          <PromptLibraryCategory>
            {prompts.map((p) => (
              <PromptLibraryItem key={p.id} prompt={p} disablePreview />
            ))}
          </PromptLibraryCategory>
        </PromptLibraryList>
      </PromptLibraryContent>
    </PromptLibrary>
  )
}

describe("PromptLibrary", () => {
  it("renders trigger with default label", () => {
    render(<Composed />)
    expect(screen.getByRole("button", { name: /prompts/i })).toBeInTheDocument()
  })

  it("opens popover and shows items on trigger click", async () => {
    const user = userEvent.setup()
    render(<Composed />)
    await user.click(screen.getByRole("button", { name: /prompts/i }))
    expect(await screen.findByText("Code Review")).toBeInTheDocument()
    expect(screen.getByText("Summarize Text")).toBeInTheDocument()
  })

  it("filters items via search input", async () => {
    const user = userEvent.setup()
    render(<Composed />)
    await user.click(screen.getByRole("button", { name: /prompts/i }))
    const search = await screen.findByPlaceholderText("Search prompts...")
    await user.type(search, "summa")
    expect(screen.queryByText("Code Review")).not.toBeInTheDocument()
    expect(screen.getByText("Summarize Text")).toBeInTheDocument()
  })
})
