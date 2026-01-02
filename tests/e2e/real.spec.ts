import { execSync } from "node:child_process"
import fs from "node:fs"
import { expect, test } from "@playwright/test"
import { expectPdfViewReady, fixtureNotebook, fixtureTheme, launchApp } from "./helpers"

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
  test.setTimeout(120_000)
  test.skip(!hasRealDeps(), "Notebook fixture or python3 missing")

  const { app, window } = await launchApp({
    E2E_NOTEBOOK_PATH: fixtureNotebook,
    E2E_THEME_PATH: fixtureTheme,
  })
  try {
    await window.getByTestId("open-notebook").click()

    const notebookView = window.getByTestId("notebook-view")
    await expect(notebookView).toHaveAttribute(
      "src",
      expect.stringContaining("http://127.0.0.1")
    )
    await expectPdfViewReady(window)

    await window.getByTestId("toggle-theme").click()
    await expect(window.getByTestId("theme-editor")).toBeVisible()
    await window.getByTestId("load-theme").click()
    await window.getByTestId("toggle-notebook").click()
  } finally {
    await app.close()
  }
})
