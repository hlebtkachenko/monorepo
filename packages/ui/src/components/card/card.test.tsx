import { render, screen } from "@testing-library/react"
import { describe, it, expect } from "vitest"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "./card"

describe("Card", () => {
  it("renders all sub-components", () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Title</CardTitle>
          <CardDescription>Description</CardDescription>
        </CardHeader>
        <CardContent>Content</CardContent>
        <CardFooter>Footer</CardFooter>
      </Card>,
    )
    expect(screen.getByText("Title")).toBeInTheDocument()
    expect(screen.getByText("Description")).toBeInTheDocument()
    expect(screen.getByText("Content")).toBeInTheDocument()
    expect(screen.getByText("Footer")).toBeInTheDocument()
  })

  it("applies size data attribute", () => {
    const { container } = render(<Card size="sm">Content</Card>)
    expect(container.querySelector("[data-slot='card']")).toHaveAttribute(
      "data-size",
      "sm",
    )
  })

  it("each slot has correct data-slot", () => {
    const { container } = render(
      <Card>
        <CardHeader>
          <CardTitle>T</CardTitle>
          <CardDescription>D</CardDescription>
        </CardHeader>
        <CardContent>C</CardContent>
        <CardFooter>F</CardFooter>
      </Card>,
    )
    expect(container.querySelector("[data-slot='card']")).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='card-header']"),
    ).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='card-title']"),
    ).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='card-description']"),
    ).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='card-content']"),
    ).toBeInTheDocument()
    expect(
      container.querySelector("[data-slot='card-footer']"),
    ).toBeInTheDocument()
  })
})
