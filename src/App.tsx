import { useCallback, useEffect, useRef, useState } from "react"
import Editor from "@monaco-editor/react"
import { Button } from "@/components/ui/button"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  ToggleGroup,
  ToggleGroupItem,
} from "@/components/ui/toggle-group"
import {
  FolderOpen,
  Loader2,
  RefreshCw,
} from "lucide-react"

const EMPTY_NOTEBOOK_TITLE = "Open a notebook to begin"
const EMPTY_PDF_TITLE = "PDF preview appears after notebook conversion"

function App() {
  const [leftMode, setLeftMode] = useState<"notebook" | "theme" | "markdown">(
    "notebook"
  )
  const [notebookPath, setNotebookPath] = useState<string | null>(null)
  const [jupyterUrl, setJupyterUrl] = useState<string | null>(null)
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [pdfVersion, setPdfVersion] = useState(0)
  const [isStartingNotebook, setIsStartingNotebook] = useState(false)
  const [isConverting, setIsConverting] = useState(false)
  const [statusMessage, setStatusMessage] = useState("Idle.")
  const [statusLevel, setStatusLevel] = useState<"info" | "success" | "error">(
    "info"
  )
  const [statusVisible, setStatusVisible] = useState(false)
  const [statusSticky, setStatusSticky] = useState(false)
  const [themeContent, setThemeContent] = useState("")
  const themeLoadedRef = useRef(false)
  const themeSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [markdownPath, setMarkdownPath] = useState<string | null>(null)
  const [markdownContent, setMarkdownContent] = useState("")
  const markdownLoadedRef = useRef(false)
  const markdownSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [themeLoaded, setThemeLoaded] = useState(false)
  const [markdownOverride, setMarkdownOverride] = useState(false)
  const [generatedMarkdownPath, setGeneratedMarkdownPath] = useState<
    string | null
  >(null)
  const openNotebookRef = useRef<Promise<void> | null>(null)
  const [recentNotebooks, setRecentNotebooks] = useState<string[]>([])

  useEffect(() => {
    if (!window.electronAPI) return
    const remove = window.electronAPI.onMarpUpdated((payload) => {
      if (!markdownOverride) {
        setPdfUrl(payload.pdfUrl)
        setPdfVersion(Date.now())
      }
      setIsConverting(false)
      if (payload.markdownPath) {
        setGeneratedMarkdownPath(payload.markdownPath)
        if (!markdownOverride) {
          setMarkdownPath(payload.markdownPath)
        }
      }
    })
    return () => remove?.()
  }, [markdownOverride])

  useEffect(() => {
    if (!window.electronAPI) return
    const loadTheme = async () => {
      try {
        const content = await window.electronAPI.getTheme()
        setThemeContent(content)
        setThemeLoaded(true)
        themeLoadedRef.current = true
      } catch {
        setThemeLoaded(true)
        themeLoadedRef.current = true
      }
    }
    void loadTheme()
  }, [])

  useEffect(() => {
    if (!window.electronAPI) return
    const loadRecents = async () => {
      const recents = await window.electronAPI.getRecentNotebooks()
      setRecentNotebooks(recents)
    }
    void loadRecents()
  }, [])

  useEffect(() => {
    if (!window.electronAPI || !markdownPath) return
    const loadMarkdown = async () => {
      try {
        const content = await window.electronAPI.getMarkdown(markdownPath)
        setMarkdownContent(content)
        window.electronAPI.setMenuState({
          hasNotebook: Boolean(notebookPath),
          hasMarkdown: true,
          hasTheme: themeLoaded,
        })
        markdownLoadedRef.current = true
      } catch {
        markdownLoadedRef.current = true
      }
    }
    void loadMarkdown()
  }, [markdownPath, notebookPath, themeLoaded])

  useEffect(() => {
    if (!window.electronAPI) return
    if (!themeLoadedRef.current) return
    if (themeSaveTimer.current) {
      clearTimeout(themeSaveTimer.current)
    }
    themeSaveTimer.current = setTimeout(async () => {
      try {
        await window.electronAPI.saveTheme(themeContent)
      } catch {
        // Status updates are emitted from the main process.
      }
    }, 700)
    return () => {
      if (themeSaveTimer.current) {
        clearTimeout(themeSaveTimer.current)
      }
    }
  }, [themeContent])

  useEffect(() => {
    if (!window.electronAPI || !markdownPath) return
    if (!markdownLoadedRef.current) return
    if (markdownSaveTimer.current) {
      clearTimeout(markdownSaveTimer.current)
    }
    markdownSaveTimer.current = setTimeout(async () => {
      try {
        await window.electronAPI.saveMarkdown({
          filePath: markdownPath,
          content: markdownContent,
        })
        const response = await window.electronAPI.convertMarkdown(markdownPath)
        setPdfUrl(response.pdfUrl)
        setPdfVersion(Date.now())
      } catch {
        // Status updates are emitted from the main process.
      }
    }, 700)
    return () => {
      if (markdownSaveTimer.current) {
        clearTimeout(markdownSaveTimer.current)
      }
    }
  }, [markdownContent, markdownPath])

  useEffect(() => {
    if (!window.electronAPI) return
    const remove = window.electronAPI.onStatusUpdated((payload) => {
      setStatusMessage(payload.message)
      setStatusLevel(payload.level)
      setStatusVisible(true)
      setStatusSticky(payload.level === "error")
    })
    return () => remove?.()
  }, [])

  useEffect(() => {
    if (isStartingNotebook || isConverting) {
      setStatusVisible(true)
      return
    }
    if (statusSticky) return
    if (!statusVisible) return
    const timer = setTimeout(() => setStatusVisible(false), 2200)
    return () => clearTimeout(timer)
  }, [isStartingNotebook, isConverting, statusSticky, statusVisible])

  const openNotebook = useCallback(async (path: string) => {
    if (!window.electronAPI) return
    if (openNotebookRef.current) {
      return openNotebookRef.current
    }
    const task = (async () => {
      setNotebookPath(path)
      setIsStartingNotebook(true)
      try {
        const response = await window.electronAPI.launchNotebook(path)
        setJupyterUrl(response.url)
        setIsConverting(true)
        try {
          const marpResponse = await window.electronAPI.convertNotebook(path)
          setPdfUrl(marpResponse.pdfUrl)
          setPdfVersion(Date.now())
          setGeneratedMarkdownPath(marpResponse.markdownPath)
          if (!markdownOverride) {
            setMarkdownPath(marpResponse.markdownPath)
          }
        } catch (error) {
          if (
            error instanceof Error &&
            error.message.includes("conversion already in progress")
          ) {
            // Ignore duplicate conversions.
          } else {
            throw error
          }
        }
        window.electronAPI.setMenuState({
          hasNotebook: true,
          hasMarkdown: true,
          hasTheme: themeLoaded,
        })
        window.electronAPI.setLastNotebook(path)
        await window.electronAPI.watchNotebook(path)
      } finally {
        setIsStartingNotebook(false)
        setIsConverting(false)
        openNotebookRef.current = null
      }
    })()
    openNotebookRef.current = task
    return task
  }, [markdownOverride, themeLoaded])

  const handleOpenNotebook = useCallback(async () => {
    if (!window.electronAPI) return
    if (isStartingNotebook) return
    const selected = await window.electronAPI.openNotebookDialog()
    if (!selected) return
    try {
      await openNotebook(selected)
      const recents = await window.electronAPI.addRecentNotebook(selected)
      setRecentNotebooks(recents)
    } catch {
      setStatusMessage("Failed to open notebook.")
    }
  }, [isStartingNotebook, openNotebook])

  const handleLoadTheme = useCallback(async () => {
    if (!window.electronAPI) return
    const selected = await window.electronAPI.openThemeDialog()
    if (!selected) return
    try {
      const content = await window.electronAPI.loadTheme(selected)
      setThemeContent(content)
    } catch {
      // Status updates are emitted from the main process.
    }
  }, [])

  const handleSaveThemeAs = useCallback(async () => {
    if (!window.electronAPI) return
    const targetPath = await window.electronAPI.saveThemeDialog()
    if (!targetPath) return
    try {
      await window.electronAPI.saveMarkdown({
        filePath: targetPath,
        content: themeContent,
      })
      window.electronAPI.setMenuState({
        hasNotebook: Boolean(notebookPath),
        hasMarkdown: Boolean(markdownPath),
        hasTheme: true,
      })
    } catch {
      // Status updates are emitted from the main process.
    }
  }, [markdownPath, notebookPath, themeContent])

  const handleSaveMarkdownAs = useCallback(async () => {
    if (!window.electronAPI) return
    const targetPath = await window.electronAPI.saveMarkdownDialog()
    if (!targetPath) return
    try {
      await window.electronAPI.saveMarkdown({
        filePath: targetPath,
        content: markdownContent,
      })
      setMarkdownPath(targetPath)
      setMarkdownOverride(true)
      const response = await window.electronAPI.convertMarkdown(targetPath)
      setPdfUrl(response.pdfUrl)
      setPdfVersion(Date.now())
      window.electronAPI.setMenuState({
        hasNotebook: Boolean(notebookPath),
        hasMarkdown: true,
        hasTheme: themeLoaded,
      })
    } catch {
      // Status updates are emitted from the main process.
    }
  }, [markdownContent, notebookPath, themeLoaded])

  const handleConvert = useCallback(async () => {
    if (!window.electronAPI || !notebookPath) return
    setIsConverting(true)
    try {
      const response = await window.electronAPI.convertNotebook(notebookPath)
      setPdfUrl(response.pdfUrl)
      setPdfVersion(Date.now())
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.includes("conversion already in progress")
      ) {
        return
      }
      setStatusMessage("Failed to rebuild PDF.")
    } finally {
      setIsConverting(false)
    }
  }, [notebookPath])

  useEffect(() => {
    if (!window.electronAPI) return
    window.electronAPI.setMenuState({
      hasNotebook: Boolean(notebookPath),
      hasMarkdown: Boolean(markdownPath || generatedMarkdownPath),
      hasTheme: themeLoaded,
      recentNotebooks,
    })
    const removeOpen = window.electronAPI.onMenuOpenNotebook(handleOpenNotebook)
    const removeRebuild = window.electronAPI.onMenuRebuildPdf(handleConvert)
    const removeLoadTheme = window.electronAPI.onMenuLoadTheme(handleLoadTheme)
    const removeSaveTheme = window.electronAPI.onMenuSaveTheme(handleSaveThemeAs)
    const removeSaveMarkdown =
      window.electronAPI.onMenuSaveMarkdown(handleSaveMarkdownAs)
    const removeRecent = window.electronAPI.onMenuOpenRecentNotebook(
      async (path) => {
        try {
          await openNotebook(path)
        } catch {
          setStatusMessage("Failed to open recent notebook.")
        }
      }
    )
    return () => {
      removeOpen?.()
      removeRebuild?.()
      removeLoadTheme?.()
      removeSaveTheme?.()
      removeSaveMarkdown?.()
      removeRecent?.()
    }
  }, [
    generatedMarkdownPath,
    handleConvert,
    handleLoadTheme,
    handleOpenNotebook,
    handleSaveMarkdownAs,
    handleSaveThemeAs,
    markdownPath,
    notebookPath,
    openNotebook,
    recentNotebooks,
    themeLoaded,
  ])

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        <header className="app-drag titlebar flex items-center justify-between border-b border-border/70 bg-secondary/60 px-3 backdrop-blur">
          <div className="app-no-drag flex items-center gap-2 pl-20">
            <ToggleGroup
              type="single"
              value={leftMode}
              onValueChange={(value) => {
                if (value) {
                  setLeftMode(value as "notebook" | "theme" | "markdown")
                }
              }}
              className="h-7 rounded-full border border-border/60 bg-background/80 px-1"
            >
              <ToggleGroupItem
                value="notebook"
                aria-label="Notebook"
                data-testid="toggle-notebook"
                className="h-5 rounded-full px-3 text-[11px]"
              >
                Notebook
              </ToggleGroupItem>
              <ToggleGroupItem
                value="markdown"
                aria-label="Markdown"
                data-testid="toggle-markdown"
                className="h-5 rounded-full px-3 text-[11px]"
              >
                Markdown
              </ToggleGroupItem>
              <ToggleGroupItem
                value="theme"
                aria-label="Theme CSS"
                data-testid="toggle-theme"
                className="h-5 rounded-full px-3 text-[11px]"
              >
                Theme CSS
              </ToggleGroupItem>
            </ToggleGroup>
          </div>
          <div className="app-no-drag flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={handleConvert}
                  disabled={!notebookPath || isConverting}
                  data-testid="rebuild-pdf"
                  className="h-7 px-3 text-[11px]"
                >
                  {isConverting ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="mr-2 h-4 w-4" />
                  )}
                  Rebuild PDF
                </Button>
              </TooltipTrigger>
              <TooltipContent>Convert notebook to PDF</TooltipContent>
            </Tooltip>
          </div>
        </header>

        {!notebookPath ? (
          <div className="flex flex-1 items-center justify-center bg-muted/10" data-testid="landing">
            <div className="flex max-w-md flex-col gap-4 text-center">
              <div className="text-lg font-semibold">Open a notebook</div>
              <div className="text-sm text-muted-foreground">
                Use File → Open Notebook or pick a recent file below.
              </div>
              <div className="flex flex-col gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenNotebook}
                  disabled={isStartingNotebook}
                  data-testid="open-notebook"
                >
                  {isStartingNotebook ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <FolderOpen className="mr-2 h-4 w-4" />
                  )}
                  Open Notebook
                </Button>
                {recentNotebooks.length > 0 && (
                  <div className="rounded-lg border border-border/60 bg-background/70 p-3 text-left text-xs text-muted-foreground">
                    <div className="mb-2 text-[11px] uppercase tracking-wide text-muted-foreground">
                      Recent
                    </div>
                    <div className="flex flex-col gap-1">
                      {recentNotebooks.map((entry) => (
                        <button
                          key={entry}
                          className="app-no-drag truncate text-left text-sm text-foreground hover:underline"
                          onClick={() => openNotebook(entry)}
                        >
                          {entry}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="flex min-h-0 flex-1">
            <ResizablePanelGroup direction="horizontal" className="h-full w-full">
              <ResizablePanel defaultSize={60} minSize={35}>
                <div className="flex h-full flex-col bg-background">
                  {leftMode === "notebook" ? (
                    jupyterUrl ? (
                      <webview
                        className="h-full w-full"
                        src={jupyterUrl}
                        allowpopups="true"
                        data-testid="notebook-view"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center bg-muted/30 text-sm text-muted-foreground">
                        {EMPTY_NOTEBOOK_TITLE}
                      </div>
                    )
                  ) : leftMode === "theme" ? (
                    <div className="flex h-full flex-col" data-testid="theme-editor">
                      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                        <span>Marp theme stylesheet (auto-applies on save)</span>
                        <div className="flex items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleLoadTheme}
                            data-testid="load-theme"
                          >
                            Load CSS
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={handleSaveThemeAs}
                            data-testid="save-theme"
                          >
                            Save as…
                          </Button>
                        </div>
                      </div>
                      <div className="min-h-0 flex-1">
                        <Editor
                          value={themeContent}
                          onChange={(value) => setThemeContent(value ?? "")}
                          language="css"
                          theme="vs-light"
                          options={{
                            minimap: { enabled: false },
                            fontSize: 12,
                            wordWrap: "on",
                            padding: { top: 12, bottom: 12 },
                          }}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="flex h-full flex-col" data-testid="markdown-editor">
                      <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                      <span>
                        {markdownOverride
                          ? "Custom slides markdown (auto-saves on edit)"
                          : "Generated slides markdown (auto-saves on edit)"}
                      </span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={handleSaveMarkdownAs}
                          data-testid="save-markdown"
                        >
                          Save as…
                        </Button>
                      </div>
                      {markdownPath ? (
                        <div className="min-h-0 flex-1">
                          <Editor
                            value={markdownContent}
                            onChange={(value) => setMarkdownContent(value ?? "")}
                            language="markdown"
                            theme="vs-light"
                            options={{
                              minimap: { enabled: false },
                              fontSize: 12,
                              wordWrap: "on",
                              padding: { top: 12, bottom: 12 },
                            }}
                          />
                        </div>
                      ) : (
                        <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
                          Open a notebook to generate markdown.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </ResizablePanel>
              <ResizableHandle withHandle className="w-2 bg-border/80" />
              <ResizablePanel defaultSize={40} minSize={25}>
                <div className="flex h-full flex-col bg-muted/20">
                  {pdfUrl ? (
                    <webview
                      className="h-full w-full"
                      src={`${pdfUrl}?v=${pdfVersion}`}
                      allowpopups="true"
                      data-testid="pdf-view"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                      {EMPTY_PDF_TITLE}
                    </div>
                  )}
                </div>
              </ResizablePanel>
            </ResizablePanelGroup>
          </div>
        )}

        <div className="pointer-events-none fixed bottom-4 right-4 z-50">
          <div
            className={`flex items-center gap-2 rounded-full border border-border/70 bg-background/95 px-4 py-2 text-xs shadow-lg backdrop-blur transition-all ${
              statusVisible
                ? "translate-y-0 opacity-100"
                : "translate-y-3 opacity-0"
            }`}
            data-testid="status-toast"
          >
            {(isStartingNotebook || isConverting) && (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            )}
            <span
              className={
                statusLevel === "error"
                  ? "text-destructive"
                  : statusLevel === "success"
                    ? "text-foreground"
                    : "text-muted-foreground"
              }
            >
              {statusMessage}
            </span>
          </div>
        </div>
      </div>

    </TooltipProvider>
  )
}

export default App
