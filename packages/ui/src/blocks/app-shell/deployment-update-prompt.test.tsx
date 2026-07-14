import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { DeploymentUpdatePrompt } from "./deployment-update-prompt"

afterEach(() => {
  cleanup()
  window.localStorage.clear()
  vi.unstubAllGlobals()
})

describe("DeploymentUpdatePrompt", () => {
  it("shows a newer deployment with a reload action", async () => {
    const reloadPage = vi.fn()
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sha: "new-sha",
        version: "1.2.3-new",
        time: "2026-07-14T00:00:00Z",
        runtime: "node-24",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    render(
      <DeploymentUpdatePrompt
        initialDeployment={{ sha: "old-sha", version: "1.2.3-old" }}
        reloadPage={reloadPage}
      />,
    )

    expect(await screen.findByText("Update ready")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Reload now" })).toHaveFocus()
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/^\/api\/version\?t=\d+$/),
      expect.objectContaining({ cache: "no-store" }),
    )
    expect(fetchMock).toHaveBeenCalledOnce()

    fireEvent.click(screen.getByRole("button", { name: "Reload now" }))
    expect(reloadPage).toHaveBeenCalledOnce()
  })

  it("stays hidden when the deployment has not changed", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sha: "same-sha",
        version: "1.2.3",
        time: "2026-07-14T00:00:00Z",
        runtime: "node-24",
      }),
    })
    vi.stubGlobal("fetch", fetchMock)

    render(
      <DeploymentUpdatePrompt
        initialDeployment={{ sha: "same-sha", version: "1.2.3" }}
      />,
    )

    await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
    expect(screen.queryByText("Update ready")).not.toBeInTheDocument()
  })

  it("keeps a dismissed deployment hidden until a later deployment", async () => {
    let availableDeployment = {
      sha: "new-sha",
      version: "1.2.3-new",
      time: "2026-07-14T00:00:00Z",
      runtime: "node-24",
    }
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => availableDeployment,
    })
    vi.stubGlobal("fetch", fetchMock)

    const initialDeployment = { sha: "old-sha", version: "1.2.3-old" }
    const first = render(
      <DeploymentUpdatePrompt initialDeployment={initialDeployment} />,
    )

    fireEvent.click(await screen.findByRole("button", { name: "Later" }))
    expect(screen.queryByText("Update ready")).not.toBeInTheDocument()
    first.unmount()

    render(<DeploymentUpdatePrompt initialDeployment={initialDeployment} />)

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    expect(screen.queryByText("Update ready")).not.toBeInTheDocument()

    availableDeployment = {
      ...availableDeployment,
      sha: "newest-sha",
      version: "1.2.3-newest",
    }
    fireEvent(window, new Event("focus"))

    expect(await screen.findByText("Update ready")).toBeInTheDocument()
  })
})
