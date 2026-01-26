// @vitest-environment jsdom
import React from "react"
import "@testing-library/jest-dom/vitest"
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/components/ui/button", () => ({
  Button: (props: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button type="button" {...props} />
  ),
}))

vi.mock("@/components/ui/resizable", () => ({
  ResizableHandle: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props} />
  ),
  ResizablePanel: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props} />
  ),
  ResizablePanelGroup: (props: React.HTMLAttributes<HTMLDivElement>) => (
    <div {...props} />
  ),
}))

vi.mock("@/components/ui/tooltip", () => ({
  TooltipProvider: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tooltip: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TooltipContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock("@/components/ui/toggle-group", () => ({
  ToggleGroup: ({
    children,
    onValueChange,
  }: {
    children: React.ReactNode
    onValueChange?: (value: string) => void
  }) => (
    <div>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child, { onValueChange })
          : child
      )}
    </div>
  ),
  ToggleGroupItem: ({
    children,
    value,
    onValueChange,
    ...rest
  }: React.ButtonHTMLAttributes<HTMLButtonElement> & {
    value?: string
    onValueChange?: (value: string) => void
  }) => (
    <button
      type="button"
      onClick={() => value && onValueChange?.(value)}
      {...rest}
    >
      {children}
    </button>
  ),
}))

vi.mock("lucide-react", () => ({
  FolderOpen: () => <span />,
  Loader2: () => <span />,
  RefreshCw: () => <span />,
}))

const { default: App } = await import("../../src/App")

vi.mock("@monaco-editor/react", () => ({
  default: (props: {
    value?: string
    onChange?: (value?: string) => void
    language?: string
  }) => (
    <textarea
      data-testid={`editor-${props.language ?? "unknown"}`}
      value={props.value ?? ""}
      onChange={(event) => props.onChange?.(event.target.value)}
    />
  ),
}))

type MarpPayload = { pdfUrl: string; markdownPath?: string }

type ElectronAPIMock = {
  openNotebookDialog: () => Promise<string | null>
  openMarkdownDialog: () => Promise<string | null>
  openThemeDialog: () => Promise<string | null>
  saveMarkdownDialog: () => Promise<string | null>
  saveThemeDialog: () => Promise<string | null>
  getLastNotebook: () => Promise<string | null>
  setLastNotebook: (path: string | null) => Promise<void>
  addRecentNotebook: (path: string) => Promise<string[]>
  getRecentNotebooks: () => Promise<string[]>
  launchNotebook: (path: string) => Promise<{ url: string }>
  convertNotebook: (path: string) => Promise<{ pdfUrl: string; markdownPath: string }>
  watchNotebook: (path: string) => Promise<void>
  getTheme: () => Promise<string>
  getMarkdown: (path: string) => Promise<string>
  saveMarkdown: (payload: { filePath: string; content: string }) => Promise<void>
  loadTheme: (path: string) => Promise<string>
  saveTheme: (content: string) => Promise<void>
  convertMarkdown: (path: string) => Promise<{ pdfUrl: string }>
  watchMarkdown: (path: string) => Promise<void>
  onMarpUpdated: (
    callback: (payload: MarpPayload) => void
  ) => (() => void) | void
  onStatusUpdated: (
    callback: (payload: { message: string; level: "info" | "success" | "error" }) => void
  ) => (() => void) | void
  onMenuOpenNotebook: (callback: () => void) => (() => void) | void
  onMenuRebuildPdf: (callback: () => void) => (() => void) | void
  onMenuLoadTheme: (callback: () => void) => (() => void) | void
  onMenuSaveTheme: (callback: () => void) => (() => void) | void
  onMenuSaveMarkdown: (callback: () => void) => (() => void) | void
  onMenuOpenRecentNotebook: (callback: (path: string) => void) => (() => void) | void
  setMenuState: (payload: {
    hasNotebook: boolean
    hasMarkdown: boolean
    hasTheme: boolean
    recentNotebooks?: string[]
  }) => Promise<void>
}

const setupElectronApi = (overrides: Partial<ElectronAPIMock> = {}) => {
  const marpListeners = new Set<(payload: MarpPayload) => void>()
  const electronAPI: ElectronAPIMock = {
    openNotebookDialog: vi.fn().mockResolvedValue("/tmp/example.ipynb"),
    openMarkdownDialog: vi.fn().mockResolvedValue(null),
    openThemeDialog: vi.fn().mockResolvedValue(null),
    saveMarkdownDialog: vi.fn().mockResolvedValue("/tmp/custom.md"),
    saveThemeDialog: vi.fn().mockResolvedValue(null),
    getLastNotebook: vi.fn().mockResolvedValue(null),
    setLastNotebook: vi.fn().mockResolvedValue(undefined),
    addRecentNotebook: vi.fn().mockResolvedValue([]),
    getRecentNotebooks: vi.fn().mockResolvedValue([]),
    launchNotebook: vi.fn().mockResolvedValue({ url: "data:text/html,notebook" }),
    convertNotebook: vi.fn().mockResolvedValue({
      pdfUrl: "file:///tmp/first.pdf",
      markdownPath: "/tmp/generated-1.md",
    }),
    watchNotebook: vi.fn().mockResolvedValue(undefined),
    getTheme: vi.fn().mockResolvedValue(""),
    getMarkdown: vi.fn().mockImplementation(async (path: string) => {
      if (path.includes("generated-2")) return "generated two"
      return "generated one"
    }),
    saveMarkdown: vi.fn().mockResolvedValue(undefined),
    loadTheme: vi.fn().mockResolvedValue(""),
    saveTheme: vi.fn().mockResolvedValue(undefined),
    convertMarkdown: vi.fn().mockResolvedValue({ pdfUrl: "file:///tmp/edited.pdf" }),
    watchMarkdown: vi.fn().mockResolvedValue(undefined),
    onMarpUpdated: vi.fn((callback) => {
      marpListeners.add(callback)
      return () => marpListeners.delete(callback)
    }),
    onStatusUpdated: vi.fn(() => () => undefined),
    onMenuOpenNotebook: vi.fn(() => () => undefined),
    onMenuRebuildPdf: vi.fn(() => () => undefined),
    onMenuLoadTheme: vi.fn(() => () => undefined),
    onMenuSaveTheme: vi.fn(() => () => undefined),
    onMenuSaveMarkdown: vi.fn(() => () => undefined),
    onMenuOpenRecentNotebook: vi.fn(() => () => undefined),
    setMenuState: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  }

  return { electronAPI, marpListeners }
}

describe("markdown sync behavior", () => {
  beforeEach(() => {
    vi.useRealTimers()
  })

  afterEach(() => {
    delete (window as Window & { electronAPI?: ElectronAPIMock }).electronAPI
    cleanup()
    vi.restoreAllMocks()
  })

  it("updates markdown content when notebook conversion emits a new markdown path", async () => {
    const { electronAPI, marpListeners } = setupElectronApi()
    ;(window as Window & { electronAPI?: ElectronAPIMock }).electronAPI =
      electronAPI

    render(<App />)

    fireEvent.click(screen.getByTestId("open-notebook"))
    await waitFor(() => expect(electronAPI.convertNotebook).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId("toggle-markdown"))

    await waitFor(() => {
      expect(screen.getByTestId("editor-markdown")).toHaveValue("generated one")
    })

    act(() => {
      marpListeners.forEach((listener) =>
        listener({
          pdfUrl: "file:///tmp/second.pdf",
          markdownPath: "/tmp/generated-2.md",
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByTestId("editor-markdown")).toHaveValue("generated two")
    })
  })

  it("auto-saves markdown edits and refreshes the PDF preview", async () => {
    const { electronAPI } = setupElectronApi()
    ;(window as Window & { electronAPI?: ElectronAPIMock }).electronAPI =
      electronAPI

    render(<App />)

    fireEvent.click(screen.getByTestId("open-notebook"))
    await waitFor(() => expect(electronAPI.convertNotebook).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId("toggle-markdown"))

    await waitFor(() => {
      expect(screen.getByTestId("editor-markdown")).toHaveValue("generated one")
    })

    fireEvent.change(screen.getByTestId("editor-markdown"), {
      target: { value: "updated markdown" },
    })

    await act(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 800)
        })
    )

    await waitFor(() => {
      expect(electronAPI.saveMarkdown).toHaveBeenCalledWith({
        filePath: "/tmp/generated-1.md",
        content: "updated markdown",
      })
    })
    expect(electronAPI.convertMarkdown).toHaveBeenCalledWith("/tmp/generated-1.md")
    await waitFor(() => {
      expect(screen.getByTestId("pdf-view")).toHaveAttribute(
        "src",
        expect.stringContaining("edited.pdf")
      )
    })
  })

  it("keeps markdown editor in sync with notebook conversions after saving markdown", async () => {
    const { electronAPI, marpListeners } = setupElectronApi()
    ;(window as Window & { electronAPI?: ElectronAPIMock }).electronAPI =
      electronAPI

    render(<App />)

    fireEvent.click(screen.getByTestId("open-notebook"))
    await waitFor(() => expect(electronAPI.convertNotebook).toHaveBeenCalled())

    fireEvent.click(screen.getByTestId("toggle-markdown"))
    await waitFor(() => {
      expect(screen.getByText(/Generated slides markdown/i)).toBeVisible()
    })

    fireEvent.click(screen.getByTestId("save-markdown"))
    await waitFor(() => {
      expect(screen.getByText(/Custom slides markdown/i)).toBeVisible()
    })

    act(() => {
      marpListeners.forEach((listener) =>
        listener({
          pdfUrl: "file:///tmp/second.pdf",
          markdownPath: "/tmp/generated-2.md",
        })
      )
    })

    await waitFor(() => {
      expect(screen.getByText(/Generated slides markdown/i)).toBeVisible()
    })
  })
})
