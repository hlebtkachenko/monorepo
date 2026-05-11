import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import {
  InputTags,
  InputTagsInput,
  InputTagsItem,
  InputTagsList,
} from "./input-tags"

describe("InputTags", () => {
  it("renders root with data-slot", () => {
    const { container } = render(
      <InputTags defaultValue={["a"]}>
        <InputTagsList>
          <InputTagsItem value="a">a</InputTagsItem>
          <InputTagsInput placeholder="Add..." />
        </InputTagsList>
      </InputTags>,
    )
    expect(
      container.querySelector("[data-slot=input-tags]"),
    ).toBeInTheDocument()
  })

  it("renders provided tags", () => {
    render(
      <InputTags defaultValue={["react", "vue"]}>
        <InputTagsList>
          <InputTagsItem value="react">react</InputTagsItem>
          <InputTagsItem value="vue">vue</InputTagsItem>
          <InputTagsInput placeholder="Add..." />
        </InputTagsList>
      </InputTags>,
    )
    expect(screen.getByText("react")).toBeInTheDocument()
    expect(screen.getByText("vue")).toBeInTheDocument()
  })

  it("input is reachable by placeholder", () => {
    render(
      <InputTags defaultValue={[]}>
        <InputTagsList>
          <InputTagsInput placeholder="Add tag..." />
        </InputTagsList>
      </InputTags>,
    )
    expect(screen.getByPlaceholderText("Add tag...")).toBeInTheDocument()
  })
})
