import { app, BrowserWindow, dialog, ipcMain } from "electron"
import { spawn } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import net from "node:net"
import { pathToFileURL } from "node:url"

const useDevServer = !app.isPackaged && process.env.ELECTRON_USE_DEV_SERVER !== "0"
const appRoot = app.getAppPath()
const userDataDir = app.getPath("userData")
const venvRoot = path.join(userDataDir, "venvs")
const marpOutputDir = path.join(userDataDir, "marp")
const isMock = process.env.E2E_MOCK === "1"

let mainWindow: BrowserWindow | null = null
let jupyterProcess: ReturnType<typeof spawn> | null = null
const marpWatchers = new Map<string, fs.FSWatcher>()
const marpTimers = new Map<string, NodeJS.Timeout>()
const notebookWatchers = new Map<string, fs.FSWatcher>()
const notebookTimers = new Map<string, NodeJS.Timeout>()
const notebookConversionLocks = new Map<string, boolean>()

const ensureDir = async (dir: string) => {
  await fs.promises.mkdir(dir, { recursive: true })
}

const sendStatus = (message: string, level: "info" | "success" | "error" = "info") => {
  mainWindow?.webContents.send("status:update", { message, level })
}

const hashPath = (value: string) =>
  crypto.createHash("sha256").update(value).digest("hex").slice(0, 16)

const resolveBundledPython = () => {
  if (process.env.PYTHON_PATH) {
    return process.env.PYTHON_PATH
  }
  if (app.isPackaged) {
    const macCandidates = [
      path.join(process.resourcesPath, "python", "bin", "python3"),
      path.join(process.resourcesPath, "python", "bin", "python"),
      path.join(process.resourcesPath, "python", "python"),
    ]
    const found = macCandidates.find((candidate) => fs.existsSync(candidate))
    if (found) return found
  }
  return "python3"
}

const resolveMarpBin = () => {
  if (app.isPackaged) {
    return path.join(
      process.resourcesPath,
      "app.asar.unpacked",
      "node_modules",
      ".bin",
      "marp"
    )
  }
  return path.join(appRoot, "node_modules", ".bin", "marp")
}

const resolveFixturePath = (fileName: string) =>
  path.join(appRoot, "resources", "fixtures", fileName)

const runCommand = (
  command: string,
  args: string[],
  options: { cwd?: string; timeoutMs?: number; label?: string } = {}
) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    })
    let stderr = ""
    let stdout = ""
    const timeout =
      options.timeoutMs &&
      setTimeout(() => {
        child.kill("SIGKILL")
        reject(new Error(`${options.label || command} timed out`))
      }, options.timeoutMs)

    child.stdout.on("data", (data) => {
      const text = data.toString()
      stdout += text
      if (stdout.length > 2000) stdout = stdout.slice(-2000)
      console.log(text.trim())
    })
    child.stderr.on("data", (data) => {
      const text = data.toString()
      stderr += text
      if (stderr.length > 2000) stderr = stderr.slice(-2000)
      console.error(text.trim())
    })
    child.on("error", reject)
    child.on("close", (code) => {
      if (timeout) clearTimeout(timeout)
      if (code === 0) resolve()
      else {
        const detail = stderr || stdout
        reject(
          new Error(
            `${options.label || command} exited with code ${code}${
              detail ? `: ${detail.trim()}` : ""
            }`
          )
        )
      }
    })
  })

const getFreePort = () =>
  new Promise<number>((resolve, reject) => {
    const server = net.createServer()
    server.unref()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (address && typeof address === "object") {
        const { port } = address
        server.close(() => resolve(port))
      } else {
        server.close()
        reject(new Error("Unable to determine free port"))
      }
    })
  })

const ensureVenv = async (notebookPath: string) => {
  await ensureDir(venvRoot)
  const venvDir = path.join(venvRoot, hashPath(notebookPath))
  const venvMarker = path.join(venvDir, "pyvenv.cfg")
  if (!fs.existsSync(venvMarker)) {
    const python = resolveBundledPython()
    await runCommand(python, ["-m", "venv", venvDir])
  }
  const pipPath = path.join(venvDir, "bin", "pip")
  const jupyterMarker = path.join(venvDir, ".jupyterlab-installed")
  const nbconvertBinary = path.join(venvDir, "bin", "jupyter-nbconvert")
  if (!fs.existsSync(jupyterMarker)) {
    sendStatus("Installing JupyterLab + nbconvert...", "info")
    await runCommand(pipPath, ["install", "jupyterlab", "nbconvert"], {
      label: "pip install jupyterlab nbconvert",
      timeoutMs: 10 * 60 * 1000,
    })
    await fs.promises.writeFile(jupyterMarker, "ok")
  } else if (!fs.existsSync(nbconvertBinary)) {
    sendStatus("Installing nbconvert...", "info")
    await runCommand(pipPath, ["install", "nbconvert"], {
      label: "pip install nbconvert",
      timeoutMs: 10 * 60 * 1000,
    })
  }
  return { venvDir, pipPath }
}

const startJupyter = async (notebookPath: string) => {
  if (isMock) {
    sendStatus("Mock JupyterLab ready.", "success")
    return { url: "data:text/html,<h2>Mock JupyterLab</h2>" }
  }
  if (jupyterProcess) {
    jupyterProcess.kill()
    jupyterProcess = null
  }
  sendStatus("Preparing Python environment...", "info")
  const { venvDir } = await ensureVenv(notebookPath)
  const python = path.join(venvDir, "bin", "python")
  const port = await getFreePort()
  const notebookDir = path.dirname(notebookPath)
  const notebookName = path.basename(notebookPath)
  const defaultUrl = `/lab/tree/${encodeURIComponent(notebookName)}`
  const args = [
    "-m",
    "jupyterlab",
    "--no-browser",
    "--ip=127.0.0.1",
    `--port=${port}`,
    "--ServerApp.token=",
    "--ServerApp.password=",
    `--ServerApp.root_dir=${notebookDir}`,
    `--ServerApp.default_url=${defaultUrl}`,
  ]

  sendStatus("Launching JupyterLab...", "info")
  jupyterProcess = spawn(python, args, {
    cwd: notebookDir,
    stdio: "inherit",
  })

  const url = `http://127.0.0.1:${port}${defaultUrl}`
  await waitForHttp(url, 15000)
  sendStatus("JupyterLab ready.", "success")
  return { url }
}

const waitForHttp = (url: string, timeoutMs: number) =>
  new Promise<void>((resolve, reject) => {
    const start = Date.now()
    const attempt = () => {
      const request = http.get(url, (response) => {
        response.resume()
        if (response.statusCode && response.statusCode < 500) {
          resolve()
        } else {
          retry()
        }
      })
      request.on("error", retry)
    }

    const retry = () => {
      if (Date.now() - start > timeoutMs) {
        reject(new Error("Timed out waiting for JupyterLab to start"))
        return
      }
      setTimeout(attempt, 350)
    }

    attempt()
  })

const convertMarkdown = async (markdownPath: string) => {
  if (isMock) {
    const pdfUrl = pathToFileURL(resolveFixturePath("sample.pdf")).toString()
    sendStatus("Mock Marp PDF ready.", "success")
    return { pdfUrl }
  }
  await ensureDir(marpOutputDir)
  const outputPath = path.join(marpOutputDir, `${hashPath(markdownPath)}.pdf`)
  const marpBin = resolveMarpBin()
  sendStatus("Rendering Marp PDF...", "info")
  await runCommand(
    marpBin,
    [
      "--pdf",
      "--allow-local-files",
      "--browser-timeout",
      "60",
      "-o",
      outputPath,
      markdownPath,
    ],
    { label: "marp", timeoutMs: 2 * 60 * 1000 }
  )
  const pdfUrl = pathToFileURL(outputPath).toString()
  sendStatus("Marp PDF ready.", "success")
  return { pdfUrl }
}

const convertNotebookToMarkdown = async (notebookPath: string) => {
  if (isMock) {
    return resolveFixturePath("sample.md")
  }
  await ensureDir(marpOutputDir)
  const { venvDir } = await ensureVenv(notebookPath)
  const python = path.join(venvDir, "bin", "python")
  const outputBase = `notebook-${hashPath(notebookPath)}`
  sendStatus("Converting notebook to Markdown...", "info")
  await runCommand(python, [
    "-m",
    "nbconvert",
    "--to",
    "markdown",
    "--output",
    outputBase,
    "--output-dir",
    marpOutputDir,
    notebookPath,
  ], { label: "nbconvert", timeoutMs: 2 * 60 * 1000 })
  sendStatus("Notebook converted to Markdown.", "success")
  return path.join(marpOutputDir, `${outputBase}.md`)
}

const convertNotebookPipeline = async (notebookPath: string) => {
  if (notebookConversionLocks.get(notebookPath)) return null
  notebookConversionLocks.set(notebookPath, true)
  try {
    sendStatus("Starting notebook → PDF pipeline...", "info")
    const markdownPath = await convertNotebookToMarkdown(notebookPath)
    const payload = await convertMarkdown(markdownPath)
    sendStatus("Notebook PDF ready.", "success")
    return { markdownPath, ...payload }
  } finally {
    notebookConversionLocks.set(notebookPath, false)
  }
}

const scheduleMarpConversion = async (markdownPath: string) => {
  if (marpTimers.has(markdownPath)) {
    clearTimeout(marpTimers.get(markdownPath))
  }
  const timer = setTimeout(async () => {
    marpTimers.delete(markdownPath)
    try {
      const payload = await convertMarkdown(markdownPath)
      mainWindow?.webContents.send("marp:updated", payload)
    } catch (error) {
      console.error("Marp conversion failed", error)
    }
  }, 600)
  marpTimers.set(markdownPath, timer)
}

const scheduleNotebookConversion = async (notebookPath: string) => {
  if (notebookTimers.has(notebookPath)) {
    clearTimeout(notebookTimers.get(notebookPath))
  }
  const timer = setTimeout(async () => {
    notebookTimers.delete(notebookPath)
    try {
      const payload = await convertNotebookPipeline(notebookPath)
      if (payload) {
        mainWindow?.webContents.send("marp:updated", payload)
      }
    } catch (error) {
      console.error("Notebook conversion failed", error)
    }
  }, 800)
  notebookTimers.set(notebookPath, timer)
}

const startMarpWatch = async (markdownPath: string) => {
  if (marpWatchers.has(markdownPath)) return
  const watcher = fs.watch(markdownPath, () => {
    void scheduleMarpConversion(markdownPath)
  })
  marpWatchers.set(markdownPath, watcher)
}

const startNotebookWatch = async (notebookPath: string) => {
  if (isMock) return
  if (notebookWatchers.has(notebookPath)) return
  const watcher = fs.watch(notebookPath, () => {
    void scheduleNotebookConversion(notebookPath)
  })
  notebookWatchers.set(notebookPath, watcher)
}

const stopMarpWatchers = () => {
  marpWatchers.forEach((watcher) => watcher.close())
  marpWatchers.clear()
  marpTimers.forEach((timer) => clearTimeout(timer))
  marpTimers.clear()
  notebookWatchers.forEach((watcher) => watcher.close())
  notebookWatchers.clear()
  notebookTimers.forEach((timer) => clearTimeout(timer))
  notebookTimers.clear()
}

const createWindow = async () => {
  await ensureDir(venvRoot)
  await ensureDir(marpOutputDir)

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: path.join(appRoot, "dist-electron", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      webviewTag: true,
    },
  })

  const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://localhost:5173"
  if (useDevServer) {
    await mainWindow.loadURL(devServerUrl)
  } else {
    await mainWindow.loadFile(path.join(appRoot, "dist", "index.html"))
  }
}

app.whenReady().then(async () => {
  await createWindow()

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createWindow()
    }
  })
})

app.on("before-quit", () => {
  stopMarpWatchers()
  if (jupyterProcess) {
    jupyterProcess.kill()
  }
})

ipcMain.handle("dialog:openNotebook", async () => {
  if (isMock) {
    return resolveFixturePath("sample.ipynb")
  }
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Notebooks", extensions: ["ipynb"] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle("dialog:openMarkdown", async () => {
  if (isMock) {
    return resolveFixturePath("sample.md")
  }
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle("jupyter:openNotebook", async (_event, notebookPath: string) => {
  try {
    const response = await startJupyter(notebookPath)
    return response
  } catch (error) {
    sendStatus("Failed to start JupyterLab.", "error")
    throw error
  }
})

ipcMain.handle("notebook:convert", async (_event, notebookPath: string) => {
  try {
    const payload = await convertNotebookPipeline(notebookPath)
    if (!payload) {
      throw new Error("Notebook conversion already in progress")
    }
    return payload
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Notebook conversion failed."
    sendStatus(message, "error")
    throw error
  }
})

ipcMain.handle("notebook:watch", async (_event, notebookPath: string) => {
  await startNotebookWatch(notebookPath)
})

ipcMain.handle("packages:install", async (_event, payload) => {
  const { notebookPath, packages } = payload as {
    notebookPath: string
    packages: string[]
  }
  const { pipPath } = await ensureVenv(notebookPath)
  await runCommand(pipPath, ["install", ...packages])
})

ipcMain.handle("marp:convert", async (_event, markdownPath: string) => {
  return convertMarkdown(markdownPath)
})

ipcMain.handle("marp:watch", async (_event, markdownPath: string) => {
  await startMarpWatch(markdownPath)
})
