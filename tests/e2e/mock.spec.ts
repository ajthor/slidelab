import { expect, test } from "@playwright/test"
import { expectPdfViewReady, fixtureTheme, fixtureThemeSave, launchApp } from "./helpers"

test("mock: open notebook triggers PDF preview", async () => {
  const { app, window } = await launchApp({
    E2E_MOCK: "1",
    E2E_THEME_PATH: fixtureTheme,
    E2E_THEME_SAVE_PATH: fixtureThemeSave,
  })
  try {
    await expect(window.getByTestId("landing")).toBeVisible()
    await window.getByTestId("open-notebook").click()

    const notebookView = window.getByTestId("notebook-view")
    await expect(notebookView).toHaveAttribute(
      "src",
      expect.stringContaining("data:text/html")
    )
    await expectPdfViewReady(window)
  } finally {
    await app.close()
  }
})

test("mock: rebuild PDF and open packages tray", async () => {
  const { app, window } = await launchApp({ E2E_MOCK: "1" })
  try {
    await window.getByTestId("open-notebook").click()
    await expectPdfViewReady(window)

    await window.getByTestId("rebuild-pdf").click()
    await expect(window.getByTestId("status-toast")).toContainText(
      "Notebook PDF ready."
    )

    await window.getByTestId("toggle-theme").click()
    await expect(window.getByTestId("theme-editor")).toBeVisible()
    await expect(window.getByTestId("load-theme")).toBeVisible()
    await expect(window.getByTestId("save-theme")).toBeVisible()
    await window.getByTestId("save-theme").click()
    await window.getByTestId("toggle-notebook").click()
    await expect(window.getByTestId("notebook-view")).toBeVisible()
    await window.getByTestId("toggle-markdown").click()
    await expect(window.getByTestId("markdown-editor")).toBeVisible()
    await expect(window.getByTestId("save-markdown")).toBeVisible()
  } finally {
    await app.close()
  }
})
