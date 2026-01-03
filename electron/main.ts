import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron"
import { spawn } from "node:child_process"
import fs from "node:fs"
import path from "node:path"
import http from "node:http"
import net from "node:net"
import { pathToFileURL } from "node:url"
import { hashPath } from "./utils/hash"
import {
  addRecentNotebook,
  readSettings,
  writeSettings,
} from "./utils/settings"
import { defaultThemeCss } from "./utils/theme"

const useDevServer = !app.isPackaged && process.env.ELECTRON_USE_DEV_SERVER !== "0"
const appRoot = app.getAppPath()
const APP_NAME = "SlideLab"
process.title = APP_NAME
app.setName?.(APP_NAME)
app.name = APP_NAME
let userDataDir = ""
let venvRoot = ""
let marpOutputDir = ""
let themeDir = ""
let themePath = ""
let settingsPath = ""
let jupyterConfigDir = ""
const isMock = process.env.E2E_MOCK === "1"

let mainWindow: BrowserWindow | null = null
let jupyterProcess: ReturnType<typeof spawn> | null = null
const marpWatchers = new Map<string, fs.FSWatcher>()
const marpTimers = new Map<string, NodeJS.Timeout>()
const notebookWatchers = new Map<string, fs.FSWatcher>()
const notebookTimers = new Map<string, NodeJS.Timeout>()
const notebookConversionLocks = new Map<string, boolean>()
let activeNotebookPath: string | null = null
let themeTimer: NodeJS.Timeout | null = null

const ensureDir = async (dir: string) => {
  await fs.promises.mkdir(dir, { recursive: true })
}

const initPaths = () => {
  const override = process.env.E2E_USER_DATA_DIR
  if (override) {
    app.setPath("userData", override)
  }
  userDataDir = app.getPath("userData")
  venvRoot = path.join(userDataDir, "venvs")
  marpOutputDir = path.join(userDataDir, "marp")
  themeDir = path.join(userDataDir, "themes")
  themePath = path.join(themeDir, "studio-theme.css")
  settingsPath = path.join(userDataDir, "settings.json")
  jupyterConfigDir = path.join(userDataDir, "jupyter-config")
}

const loadSettings = async () => readSettings(settingsPath)
const saveSettings = async (partial: { lastNotebook?: string }) =>
  writeSettings(settingsPath, partial)

const sendStatus = (message: string, level: "info" | "success" | "error" = "info") => {
  mainWindow?.webContents.send("status:update", { message, level })
}
const ensureThemeFile = async () => {
  if (!userDataDir) initPaths()
  await ensureDir(themeDir)
  if (!fs.existsSync(themePath)) {
    await fs.promises.writeFile(themePath, defaultThemeCss)
  }
  return themePath
}

const ensureJupyterConfig = async () => {
  if (!userDataDir) initPaths()
  const labConfigDir = path.join(jupyterConfigDir, "labconfig")
  await ensureDir(labConfigDir)
  const configPath = path.join(labConfigDir, "page_config.json")
  const config = {
    simpleMode: true,
    disabledExtensions: {
      "@jupyterlab/extensionmanager-extension": true,
      "@jupyterlab/launcher-extension": true,
    },
  }
  await fs.promises.writeFile(configPath, JSON.stringify(config, null, 2))
}

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

const resolveMarpCommand = (): {
  command: string
  argsPrefix: string[]
  env?: NodeJS.ProcessEnv
} => {
  const unpackedMarpBin = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    ".bin",
    "marp"
  )
  const unpackedMarpScript = path.join(
    process.resourcesPath,
    "app.asar.unpacked",
    "node_modules",
    "@marp-team",
    "marp-cli",
    "marp-cli.js"
  )
  const devMarpBin = path.join(appRoot, "node_modules", ".bin", "marp")
  const devMarpScript = path.join(
    appRoot,
    "node_modules",
    "@marp-team",
    "marp-cli",
    "marp-cli.js"
  )

  if (app.isPackaged) {
    if (fs.existsSync(unpackedMarpBin)) {
      return { command: unpackedMarpBin, argsPrefix: [] }
    }
    if (fs.existsSync(unpackedMarpScript)) {
      return {
        command: process.execPath,
        argsPrefix: [unpackedMarpScript],
        env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
      }
    }
  }

  if (fs.existsSync(devMarpBin)) {
    return { command: devMarpBin, argsPrefix: [] }
  }
  return { command: "node", argsPrefix: [devMarpScript] }
}

const findBundledChromium = (rootDir: string) => {
  const stack: Array<{ dir: string; depth: number }> = [
    { dir: rootDir, depth: 0 },
  ]
  const maxDepth = 7

  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const { dir, depth } = current
    let entries: fs.Dirent[]
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.endsWith(".app")) {
          const appRoot = path.join(dir, entry.name)
          const macosDir = path.join(appRoot, "Contents", "MacOS")
          const chromiumBinary = path.join(macosDir, "Chromium")
          const chromeTestingBinary = path.join(
            macosDir,
            "Google Chrome for Testing"
          )
          if (fs.existsSync(chromiumBinary)) {
            return chromiumBinary
          }
          if (fs.existsSync(chromeTestingBinary)) {
            return chromeTestingBinary
          }
        }
        if (depth < maxDepth) {
          stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 })
        }
      } else if (entry.isFile() && entry.name === "Chromium") {
        return path.join(dir, entry.name)
      }
    }
  }

  return null
}

const resolveBrowserPath = () => {
  if (process.platform !== "darwin") return null
  const bundledRoot = app.isPackaged
    ? path.join(process.resourcesPath, "puppeteer")
    : path.join(appRoot, "resources", "puppeteer")
  const bundled = findBundledChromium(bundledRoot)
  if (bundled) return bundled
  const candidates = [
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Chromium.app/Contents/MacOS/Chromium",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
  ]
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null
}

const resolveConverterScript = () => {
  if (app.isPackaged) {
    const candidates = [
      path.join(process.resourcesPath, "scripts", "convert_to_slides.mjs"),
      path.join(
        process.resourcesPath,
        "app.asar.unpacked",
        "resources",
        "scripts",
        "convert_to_slides.mjs"
      ),
    ]
    const found = candidates.find((candidate) => fs.existsSync(candidate))
    if (found) return found
  }
  return path.join(appRoot, "resources", "scripts", "convert_to_slides.mjs")
}

const resolveAppIcon = () =>
  app.isPackaged
    ? path.join(process.resourcesPath, "resources", "icon.icns")
    : path.join(appRoot, "resources", "icon.png")

const resolveFixturePath = (fileName: string) =>
  path.join(appRoot, "resources", "fixtures", fileName)

const runCommand = (
  command: string,
  args: string[],
  options: {
    cwd?: string
    timeoutMs?: number
    label?: string
    env?: NodeJS.ProcessEnv
  } = {}
) =>
  new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      env: options.env,
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
  if (!fs.existsSync(jupyterMarker)) {
    sendStatus("Installing JupyterLab...", "info")
    await runCommand(pipPath, ["install", "jupyterlab"], {
      label: "pip install jupyterlab",
      timeoutMs: 10 * 60 * 1000,
    })
    await fs.promises.writeFile(jupyterMarker, "ok")
  }
  return { venvDir, pipPath }
}

const startJupyter = async (notebookPath: string) => {
  if (isMock) {
    sendStatus("Mock JupyterLab ready.", "success")
    return { url: "data:text/html,<h2>Mock JupyterLab</h2>" }
  }
  await ensureJupyterConfig()
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
  const notebookRelPath = path.relative(notebookDir, notebookPath) || notebookName
  const defaultUrl = `/lab/tree/${encodeURIComponent(
    notebookRelPath
  )}?simple=1&zen=1`
  const args = [
    "-m",
    "jupyterlab",
    "--no-browser",
    "--ip=127.0.0.1",
    `--port=${port}`,
    "--ServerApp.open_browser=False",
    "--LabApp.simple_mode=True",
    "--ServerApp.token=",
    "--ServerApp.password=",
    `--LabApp.default_url=${defaultUrl}`,
    `--ServerApp.root_dir=${notebookDir}`,
    `--ServerApp.default_url=${defaultUrl}`,
  ]

  sendStatus("Launching JupyterLab...", "info")
  jupyterProcess = spawn(python, args, {
    cwd: notebookDir,
    stdio: "inherit",
    env: {
      ...process.env,
      JUPYTER_CONFIG_DIR: jupyterConfigDir,
      BROWSER: "none",
      JUPYTER_BROWSER: "none",
      JUPYTERLAB_BROWSER: "none",
    },
  })

  const url = `http://127.0.0.1:${port}${defaultUrl}`
  await waitForHttp(url, 30000)
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
  await ensureThemeFile()
  await ensureDir(marpOutputDir)
  const outputPath = path.join(marpOutputDir, `${hashPath(markdownPath)}.pdf`)
  const marpCommand = resolveMarpCommand()
  const browserPath = resolveBrowserPath()
  sendStatus("Rendering Marp PDF...", "info")
  await runCommand(
    marpCommand.command,
    [
      ...marpCommand.argsPrefix,
      "--pdf",
      "--allow-local-files",
      "--theme",
      themePath,
      ...(browserPath ? ["--browser-path", browserPath] : []),
      "--browser-timeout",
      "60",
      "-o",
      outputPath,
      markdownPath,
    ],
    {
      label: "marp",
      timeoutMs: 2 * 60 * 1000,
      env: browserPath
        ? { ...marpCommand.env, PUPPETEER_EXECUTABLE_PATH: browserPath }
        : marpCommand.env,
    }
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
  const outputBase = `notebook-${hashPath(notebookPath)}`
  const converterScript = resolveConverterScript()
  if (!fs.existsSync(converterScript)) {
    throw new Error(`convert_to_slides.mjs not found at ${converterScript}`)
  }
  const outputPath = path.join(marpOutputDir, `${outputBase}.md`)
  const command = app.isPackaged ? process.execPath : "node"
  const env = app.isPackaged
    ? { ...process.env, ELECTRON_RUN_AS_NODE: "1" }
    : process.env
  sendStatus("Converting notebook to slides markdown...", "info")
  await runCommand(
    command,
    [converterScript, notebookPath, outputPath],
    {
      label: "convert_to_slides.mjs",
      timeoutMs: 2 * 60 * 1000,
      env,
    }
  )
  sendStatus("Notebook converted to Markdown.", "success")
  return outputPath
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
  if (!userDataDir) initPaths()
  await ensureDir(venvRoot)
  await ensureDir(marpOutputDir)
  await ensureThemeFile()

  if (!fs.existsSync(resolveConverterScript())) {
    sendStatus("Missing converter script.", "error")
  }
  const pythonPath = resolveBundledPython()
  if (app.isPackaged && !fs.existsSync(pythonPath)) {
    sendStatus("Bundled Python not found.", "error")
  }

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    titleBarStyle: "hiddenInset",
    title: APP_NAME,
    icon: resolveAppIcon(),
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

const createMenu = (
  state: {
    hasNotebook: boolean
    hasMarkdown: boolean
    hasTheme: boolean
    recentNotebooks?: string[]
  } = { hasNotebook: false, hasMarkdown: false, hasTheme: false, recentNotebooks: [] }
) => {
  const isMac = process.platform === "darwin"
  const recents = (state.recentNotebooks || []).map((entry) => ({
    label: path.basename(entry),
    click: () =>
      mainWindow?.webContents.send("menu:openRecentNotebook", entry),
  }))
  const template: Electron.MenuItemConstructorOptions[] = [
    ...(isMac
      ? [
          {
            label: APP_NAME,
            submenu: [
              { role: "about" as const },
              { type: "separator" as const },
              { role: "services" as const },
              { type: "separator" as const },
              { role: "hide" as const },
              { role: "hideOthers" as const },
              { role: "unhide" as const },
              { type: "separator" as const },
              { role: "quit" as const },
            ],
          },
        ]
      : []),
    {
      label: "File",
      submenu: [
        {
          label: "Open Notebook",
          accelerator: "CmdOrCtrl+O",
          click: () => mainWindow?.webContents.send("menu:openNotebook"),
        },
        ...(recents.length
          ? [
              { type: "separator" as const },
              {
                label: "Open Recent",
                submenu: recents,
              },
            ]
          : []),
        { type: "separator" as const },
        {
          label: "Load Theme CSS",
          enabled: state.hasNotebook,
          click: () => mainWindow?.webContents.send("menu:loadTheme"),
        },
        {
          label: "Save Theme CSS As...",
          enabled: state.hasTheme,
          click: () => mainWindow?.webContents.send("menu:saveTheme"),
        },
        {
          label: "Save Markdown As...",
          enabled: state.hasMarkdown,
          click: () => mainWindow?.webContents.send("menu:saveMarkdown"),
        },
        { type: "separator" as const },
        { role: "close" as const },
      ],
    },
    {
      label: "Edit",
      submenu: [
        { role: "undo" as const },
        { role: "redo" as const },
        { type: "separator" as const },
        { role: "cut" as const },
        { role: "copy" as const },
        { role: "paste" as const },
        { role: "selectAll" as const },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Rebuild PDF",
          accelerator: "CmdOrCtrl+Shift+R",
          enabled: state.hasNotebook,
          click: () => mainWindow?.webContents.send("menu:rebuildPdf"),
        },
        { role: "reload" as const },
        { role: "toggleDevTools" as const },
        { type: "separator" as const },
        { role: "resetZoom" as const },
        { role: "zoomIn" as const },
        { role: "zoomOut" as const },
      ],
    },
    {
      label: "Window",
      submenu: [
        { role: "minimize" as const },
        { role: "zoom" as const },
        { type: "separator" as const },
        { role: "front" as const },
      ],
    },
    { role: "help" as const },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.whenReady().then(async () => {
  app.setName?.(APP_NAME)
  app.name = APP_NAME
  app.setAboutPanelOptions({
    applicationName: APP_NAME,
  })
  initPaths()
  await createWindow()
  createMenu()
  if (process.platform === "darwin") {
    const dockIcon = resolveAppIcon()
    if (dockIcon && fs.existsSync(dockIcon)) {
      app.dock?.setIcon(dockIcon)
    }
  }

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
  if (process.env.E2E_NOTEBOOK_PATH && fs.existsSync(process.env.E2E_NOTEBOOK_PATH)) {
    return process.env.E2E_NOTEBOOK_PATH
  }
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "Notebooks", extensions: ["ipynb"] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle("app:getLastNotebook", async () => {
  if (!userDataDir) initPaths()
  const settings = await loadSettings()
  if (settings.lastNotebook && fs.existsSync(settings.lastNotebook)) {
    return settings.lastNotebook
  }
  return null
})

ipcMain.handle("app:setLastNotebook", async (_event, notebookPath: string | null) => {
  if (!userDataDir) initPaths()
  await saveSettings({ lastNotebook: notebookPath ?? undefined })
})

ipcMain.handle("app:addRecentNotebook", async (_event, notebookPath: string) => {
  if (!userDataDir) initPaths()
  return addRecentNotebook(settingsPath, notebookPath)
})

ipcMain.handle("app:getRecentNotebooks", async () => {
  if (!userDataDir) initPaths()
  const settings = await loadSettings()
  return settings.recentNotebooks || []
})

ipcMain.handle("dialog:openTheme", async () => {
  if (process.env.E2E_THEME_PATH && fs.existsSync(process.env.E2E_THEME_PATH)) {
    return process.env.E2E_THEME_PATH
  }
  const result = await dialog.showOpenDialog({
    properties: ["openFile"],
    filters: [{ name: "CSS", extensions: ["css"] }],
  })
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle("dialog:saveMarkdown", async () => {
  if (process.env.E2E_MARKDOWN_SAVE_PATH) {
    return process.env.E2E_MARKDOWN_SAVE_PATH
  }
  const result = await dialog.showSaveDialog({
    defaultPath: "slides.md",
    filters: [{ name: "Markdown", extensions: ["md", "markdown"] }],
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
})

ipcMain.handle("dialog:saveTheme", async () => {
  if (process.env.E2E_THEME_SAVE_PATH) {
    return process.env.E2E_THEME_SAVE_PATH
  }
  const result = await dialog.showSaveDialog({
    defaultPath: "theme.css",
    filters: [{ name: "CSS", extensions: ["css"] }],
  })
  if (result.canceled || !result.filePath) return null
  return result.filePath
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
    activeNotebookPath = notebookPath
    const response = await startJupyter(notebookPath)
    return response
  } catch (error) {
    sendStatus("Failed to start JupyterLab.", "error")
    throw error
  }
})

ipcMain.handle("notebook:convert", async (_event, notebookPath: string) => {
  try {
    activeNotebookPath = notebookPath
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

ipcMain.handle("theme:get", async () => {
  await ensureThemeFile()
  return fs.promises.readFile(themePath, "utf8")
})

ipcMain.handle("markdown:get", async (_event, filePath: string) => {
  return fs.promises.readFile(filePath, "utf8")
})

ipcMain.handle("markdown:save", async (_event, payload) => {
  const { filePath, content } = payload as { filePath: string; content: string }
  await fs.promises.writeFile(filePath, content)
  sendStatus("Markdown saved.", "success")
})

ipcMain.handle("theme:load", async (_event, filePath: string) => {
  const content = await fs.promises.readFile(filePath, "utf8")
  await ensureThemeFile()
  await fs.promises.writeFile(themePath, content)
  sendStatus("Theme loaded from file.", "success")
  if (activeNotebookPath) {
    const payload = await convertNotebookPipeline(activeNotebookPath)
    if (payload) {
      mainWindow?.webContents.send("marp:updated", payload)
    }
  }
  return content
})

ipcMain.handle("theme:save", async (_event, content: string) => {
  await ensureThemeFile()
  await fs.promises.writeFile(themePath, content)
  sendStatus("Theme updated.", "success")
  if (!activeNotebookPath) return
  if (themeTimer) {
    clearTimeout(themeTimer)
  }
  themeTimer = setTimeout(async () => {
    themeTimer = null
    try {
      const notebookPath = activeNotebookPath
      if (!notebookPath) return
      const payload = await convertNotebookPipeline(notebookPath)
      if (payload) {
        mainWindow?.webContents.send("marp:updated", payload)
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Theme conversion failed."
      sendStatus(message, "error")
    }
  }, 600)
})

ipcMain.handle("menu:setState", async (_event, payload) => {
  createMenu(payload as { hasNotebook: boolean; hasMarkdown: boolean; hasTheme: boolean })
})

ipcMain.handle("notebook:watch", async (_event, notebookPath: string) => {
  await startNotebookWatch(notebookPath)
})

ipcMain.handle("marp:convert", async (_event, markdownPath: string) => {
  return convertMarkdown(markdownPath)
})

ipcMain.handle("marp:watch", async (_event, markdownPath: string) => {
  await startMarpWatch(markdownPath)
})
