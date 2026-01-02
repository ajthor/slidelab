import { expect, test } from "@playwright/test"
import { expectPdfViewReady, fixtureTheme, launchApp } from "./helpers"

test("mock: open notebook triggers PDF preview", async () => {
  const { app, window } = await launchApp({
    E2E_MOCK: "1",
    E2E_THEME_PATH: fixtureTheme,
  })
  try {
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
    await window.getByTestId("toggle-notebook").click()
    await expect(window.getByTestId("notebook-view")).toBeVisible()
  } finally {
    await app.close()
  }
})
