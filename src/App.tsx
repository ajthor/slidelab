import { useEffect, useMemo, useState } from "react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import {
  FolderOpen,
  Loader2,
  PackagePlus,
  RefreshCw,
} from "lucide-react"

const EMPTY_NOTEBOOK_TITLE = "Open a notebook to begin"
const EMPTY_PDF_TITLE = "PDF preview appears after notebook conversion"

function App() {
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
  const [packagesOpen, setPackagesOpen] = useState(false)
  const [packageInput, setPackageInput] = useState("")
  const [installedPackages, setInstalledPackages] = useState<string[]>([])
  const [packageStatus, setPackageStatus] = useState<string | null>(null)

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

  const packageList = useMemo(
    () =>
      installedPackages.length
        ? installedPackages
        : ["numpy", "scipy", "matplotlib"],
    [installedPackages]
  )

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

  const handleInstallPackages = async () => {
    if (!window.electronAPI || !notebookPath) return
    const packages = packageInput
      .split(/[,\s]+/)
      .map((value) => value.trim())
      .filter(Boolean)
    if (!packages.length) return
    setPackageStatus("Installing packages...")
    try {
      await window.electronAPI.installPackages({ notebookPath, packages })
      setInstalledPackages((prev) => Array.from(new Set([...prev, ...packages])))
      setPackageInput("")
      setPackageStatus("Packages installed.")
    } catch (error) {
      setPackageStatus("Install failed. Check logs.")
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
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleOpenNotebook}
                  disabled={isStartingNotebook}
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
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPackagesOpen(true)}
              disabled={!notebookPath}
            >
              <PackagePlus className="mr-2 h-4 w-4" />
              Packages
            </Button>
          </div>
        </header>

        <div className="flex min-h-0 flex-1">
          <ResizablePanelGroup direction="horizontal" className="h-full w-full">
            <ResizablePanel defaultSize={60} minSize={35}>
              <div className="flex h-full flex-col bg-background">
                {jupyterUrl ? (
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

      <Sheet open={packagesOpen} onOpenChange={setPackagesOpen}>
        <SheetContent side="right" className="w-[360px]">
          <SheetHeader>
            <SheetTitle>Notebook packages</SheetTitle>
          </SheetHeader>
          <div className="mt-6 flex flex-col gap-4">
            <div className="space-y-2 text-sm text-muted-foreground">
              Manage the venv for the current notebook. Packages install into an
              app-managed virtual environment.
            </div>
            <div className="flex items-center gap-2">
              <Input
                placeholder="e.g. pandas scikit-learn"
                value={packageInput}
                onChange={(event) => setPackageInput(event.target.value)}
              />
              <Button size="sm" onClick={handleInstallPackages}>
                Install
              </Button>
            </div>
            {packageStatus ? (
              <div className="text-xs text-muted-foreground">{packageStatus}</div>
            ) : null}
            <ScrollArea className="h-[320px] rounded-lg border border-border/70 p-3">
              <div className="space-y-2">
                {packageList.map((pkg) => (
                  <div key={pkg} className="flex items-center justify-between">
                    <span className="text-sm">{pkg}</span>
                    <Badge variant="secondary">ready</Badge>
                  </div>
                ))}
              </div>
            </ScrollArea>
          </div>
        </SheetContent>
      </Sheet>
    </TooltipProvider>
  )
}

export default App
