import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { createRequire } from "node:module"
import type { Page } from "@playwright/test"
import { _electron as electron, expect } from "@playwright/test"

const require = createRequire(import.meta.url)
const electronExecutable = require("electron")

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export const repoRoot = path.resolve(__dirname, "../..")
export const fixtureNotebook = path.join(repoRoot, "resources", "fixtures", "sample.ipynb")
export const fixtureTheme = path.join(repoRoot, "resources", "fixtures", "theme.css")
export const fixtureThemeSave = path.join(repoRoot, "resources", "fixtures", "theme-saved.css")

export const launchApp = async (env: Record<string, string>) => {
  const userDataDir = fs.mkdtempSync(path.join(os.tmpdir(), "slides-e2e-"))
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: ["."],
    env: {
      ...process.env,
      ELECTRON_USE_DEV_SERVER: "0",
      E2E_USER_DATA_DIR: userDataDir,
      ...env,
    },
  })

  const window = await app.firstWindow()
  await window.waitForLoadState("domcontentloaded")
  return { app, window, userDataDir }
}

export const expectPdfViewReady = async (window: Page) => {
  const pdfView = window.getByTestId("pdf-view")
  await expect(pdfView).toHaveAttribute("src", expect.stringContaining(".pdf"))
}
