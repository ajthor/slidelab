import { useEffect, useRef, useState } from "react"
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
  const [leftMode, setLeftMode] = useState<"notebook" | "theme">("notebook")
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

  useEffect(() => {
    if (!window.electronAPI) return
    const remove = window.electronAPI.onMarpUpdated((payload) => {
      setPdfUrl(payload.pdfUrl)
      setPdfVersion(Date.now())
      setIsConverting(false)
    })
    return () => remove?.()
  }, [])

  useEffect(() => {
    if (!window.electronAPI) return
    const loadTheme = async () => {
      try {
        const content = await window.electronAPI.getTheme()
        setThemeContent(content)
        themeLoadedRef.current = true
      } catch {
        themeLoadedRef.current = true
      }
    }
    void loadTheme()
  }, [])

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

  const handleOpenNotebook = async () => {
    if (!window.electronAPI) return
    const selected = await window.electronAPI.openNotebookDialog()
    if (!selected) return
    setNotebookPath(selected)
    setIsStartingNotebook(true)
    try {
      const response = await window.electronAPI.launchNotebook(selected)
      setJupyterUrl(response.url)
      setIsConverting(true)
      const marpResponse = await window.electronAPI.convertNotebook(selected)
      setPdfUrl(marpResponse.pdfUrl)
      setPdfVersion(Date.now())
      await window.electronAPI.watchNotebook(selected)
    } finally {
      setIsStartingNotebook(false)
      setIsConverting(false)
    }
  }

  const handleLoadTheme = async () => {
    if (!window.electronAPI) return
    const selected = await window.electronAPI.openThemeDialog()
    if (!selected) return
    try {
      const content = await window.electronAPI.loadTheme(selected)
      setThemeContent(content)
    } catch {
      // Status updates are emitted from the main process.
    }
  }

  const handleConvert = async () => {
    if (!window.electronAPI || !notebookPath) return
    setIsConverting(true)
    try {
      const response = await window.electronAPI.convertNotebook(notebookPath)
      setPdfUrl(response.pdfUrl)
      setPdfVersion(Date.now())
    } finally {
      setIsConverting(false)
    }
  }

  return (
    <TooltipProvider>
      <div className="flex h-screen flex-col">
        <header className="flex h-11 items-center justify-between border-b border-border/70 bg-secondary/60 px-4 backdrop-blur">
          <div className="flex items-center gap-3 pl-16">
            <div className="text-sm font-semibold tracking-wide leading-none">
              Notebook + Marp Studio
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ToggleGroup
              type="single"
              value={leftMode}
              onValueChange={(value) => {
                if (value) setLeftMode(value as "notebook" | "theme")
              }}
              className="rounded-full border border-border/60 bg-background/80 p-1"
            >
              <ToggleGroupItem
                value="notebook"
                aria-label="Notebook"
                data-testid="toggle-notebook"
                className="rounded-full px-3 text-xs"
              >
                Notebook
              </ToggleGroupItem>
              <ToggleGroupItem
                value="theme"
                aria-label="Theme CSS"
                data-testid="toggle-theme"
                className="rounded-full px-3 text-xs"
              >
                Theme CSS
              </ToggleGroupItem>
            </ToggleGroup>
            <Tooltip>
              <TooltipTrigger asChild>
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
              </TooltipTrigger>
              <TooltipContent>Launch JupyterLab in-app</TooltipContent>
            </Tooltip>
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  size="sm"
                  onClick={handleConvert}
                  disabled={!notebookPath || isConverting}
                  data-testid="rebuild-pdf"
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
                ) : (
                  <div className="flex h-full flex-col" data-testid="theme-editor">
                    <div className="flex items-center justify-between border-b border-border/60 bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
                      <span>Marp theme stylesheet (auto-applies on save)</span>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleLoadTheme}
                        data-testid="load-theme"
                      >
                        Load CSS
                      </Button>
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
                )}
              </div>
            </ResizablePanel>
            <ResizableHandle withHandle />
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
