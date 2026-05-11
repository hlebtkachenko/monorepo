import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import {
  TagsInput,
  TagsInputInput,
  TagsInputItem,
  TagsInputList,
} from "./tags-input"

describe("TagsInput", () => {
  it("renders root with data-slot", () => {
    const { container } = render(
      <TagsInput defaultValue={["a"]}>
        <TagsInputList>
          <TagsInputItem value="a">a</TagsInputItem>
          <TagsInputInput placeholder="Add..." />
        </TagsInputList>
      </TagsInput>,
    )
    expect(
      container.querySelector("[data-slot=tags-input]"),
    ).toBeInTheDocument()
  })

  it("renders provided tags", () => {
    render(
      <TagsInput defaultValue={["react", "vue"]}>
        <TagsInputList>
          <TagsInputItem value="react">react</TagsInputItem>
          <TagsInputItem value="vue">vue</TagsInputItem>
          <TagsInputInput placeholder="Add..." />
        </TagsInputList>
      </TagsInput>,
    )
    expect(screen.getByText("react")).toBeInTheDocument()
    expect(screen.getByText("vue")).toBeInTheDocument()
  })

  it("input is reachable by placeholder", () => {
    render(
      <TagsInput defaultValue={[]}>
        <TagsInputList>
          <TagsInputInput placeholder="Add tag..." />
        </TagsInputList>
      </TagsInput>,
    )
    expect(screen.getByPlaceholderText("Add tag...")).toBeInTheDocument()
  })
})
