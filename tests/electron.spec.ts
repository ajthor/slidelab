import { createRequire } from "node:module"
import { _electron as electron, expect, test } from "@playwright/test"

const require = createRequire(import.meta.url)
const electronExecutable = require("electron")

test("opens notebook and renders PDF preview (mock)", async () => {
  const app = await electron.launch({
    executablePath: electronExecutable,
    args: ["."],
    env: {
      ...process.env,
      E2E_MOCK: "1",
      ELECTRON_USE_DEV_SERVER: "0",
    },
  })

  const window = await app.firstWindow()
  await window.waitForLoadState("domcontentloaded")

  await window.getByRole("button", { name: /open notebook/i }).click()

  const notebookView = window.locator('[data-testid="notebook-view"]')
  const pdfView = window.locator('[data-testid="pdf-view"]')

  await expect(notebookView).toHaveAttribute(
    "src",
    expect.stringContaining("data:text/html")
  )
  await expect(pdfView).toHaveAttribute(
    "src",
    expect.stringContaining("sample.pdf")
  )

  await app.close()
})
