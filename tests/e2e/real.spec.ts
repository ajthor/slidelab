import { execSync } from "node:child_process"
import fs from "node:fs"
import { expect, test } from "@playwright/test"
import {
  expectPdfViewReady,
  fixtureNotebook,
  fixtureTheme,
  fixtureThemeSave,
  launchApp,
} from "./helpers"

const hasPython = () => {
  if (process.env.PYTHON_PATH) return true
  try {
    execSync("python3 --version", { stdio: "ignore" })
    return true
  } catch {
    return false
  }
}

const hasRealDeps = () => fs.existsSync(fixtureNotebook) && hasPython()

test("real: open notebook converts to PDF", async () => {
  test.setTimeout(180_000)
  test.skip(!hasRealDeps(), "Notebook fixture or python3 missing")

  const { app, window } = await launchApp({
    E2E_NOTEBOOK_PATH: fixtureNotebook,
    E2E_THEME_PATH: fixtureTheme,
    E2E_THEME_SAVE_PATH: fixtureThemeSave,
  })
  try {
    await window.getByTestId("open-notebook").click()
    await expect(window.getByTestId("landing")).toBeHidden({ timeout: 30_000 })

    const notebookView = window.getByTestId("notebook-view")
    await expect(notebookView).toHaveAttribute(
      "src",
      /http:\/\/127\.0\.0\.1/,
      { timeout: 60_000 }
    )
    await expectPdfViewReady(window, 60_000)

    await window.getByTestId("toggle-theme").click()
    await expect(window.getByTestId("theme-editor")).toBeVisible()
    await window.getByTestId("load-theme").click()
    await window.getByTestId("save-theme").click()
    await window.getByTestId("toggle-notebook").click()
    await window.getByTestId("toggle-markdown").click()
    await expect(window.getByTestId("markdown-editor")).toBeVisible()
  } finally {
    await app.close()
  }
})
