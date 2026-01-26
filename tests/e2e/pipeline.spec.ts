import { execSync } from "node:child_process"
import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { expect, test } from "@playwright/test"
import { fixtureNotebook, fixtureTheme, launchApp } from "./helpers"
import { hashPath } from "../../electron/utils/hash"

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

const getMonacoValue = async (
  window: { evaluate: <T, A>(pageFunction: (arg: A) => T, arg: A) => Promise<T> },
  language = "markdown"
) =>
  window.evaluate((lang) => {
    const monacoApi = (window as Window & { monaco?: any }).monaco
    if (!monacoApi?.editor) return null
    const models = monacoApi.editor.getModels()
    const model = models.find((entry: { getModeId: () => string }) =>
      entry.getModeId?.() === lang
    ) || models[0]
    return model ? model.getValue() : null
  }, language)

const setMonacoValue = async (
  window: { evaluate: <T, A>(pageFunction: (arg: A) => T, arg: A) => Promise<T> },
  value: string,
  language = "markdown"
) =>
  window.evaluate(({ nextValue, lang }) => {
    const monacoApi = (window as Window & { monaco?: any }).monaco
    if (!monacoApi?.editor) return false
    const models = monacoApi.editor.getModels()
    const model = models.find((entry: { getModeId: () => string }) =>
      entry.getModeId?.() === lang
    ) || models[0]
    if (!model) return false
    model.setValue(nextValue)
    return true
  }, { nextValue: value, lang: language })

test("real: notebook generates markdown and pdf", async () => {
  test.setTimeout(180_000)
  test.skip(!hasRealDeps(), "Notebook fixture or python3 missing")

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slides-pipeline-"))
  const tempNotebook = path.join(tempDir, "sample.ipynb")
  fs.copyFileSync(fixtureNotebook, tempNotebook)

  const { app, window, userDataDir } = await launchApp({
    E2E_NOTEBOOK_PATH: tempNotebook,
    E2E_THEME_PATH: fixtureTheme,
  })

  try {
    await window.getByTestId("open-notebook").click()
    await expect(window.getByTestId("landing")).toBeHidden({ timeout: 30_000 })

    const generatedMarkdownPath = path.join(
      userDataDir,
      "marp",
      `notebook-${hashPath(tempNotebook)}.md`
    )
    const generatedPdfPath = path.join(
      userDataDir,
      "marp",
      `${hashPath(generatedMarkdownPath)}.pdf`
    )

    await expect
      .poll(() => fs.existsSync(generatedMarkdownPath), { timeout: 60_000 })
      .toBe(true)
    await expect
      .poll(() => fs.existsSync(generatedPdfPath), { timeout: 60_000 })
      .toBe(true)

    const markdownContent = fs.readFileSync(generatedMarkdownPath, "utf8")
    expect(markdownContent.length).toBeGreaterThan(0)
    const pdfSize = fs.statSync(generatedPdfPath).size
    expect(pdfSize).toBeGreaterThan(0)
  } finally {
    await app.close()
  }
})

test("real: markdown edits regenerate the pdf", async () => {
  test.setTimeout(180_000)
  test.skip(!hasRealDeps(), "Notebook fixture or python3 missing")

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slides-pipeline-"))
  const tempNotebook = path.join(tempDir, "sample.ipynb")
  fs.copyFileSync(fixtureNotebook, tempNotebook)

  const { app, window, userDataDir } = await launchApp({
    E2E_NOTEBOOK_PATH: tempNotebook,
    E2E_THEME_PATH: fixtureTheme,
  })

  try {
    await window.getByTestId("open-notebook").click()
    await expect(window.getByTestId("landing")).toBeHidden({ timeout: 30_000 })

    await window.getByTestId("toggle-markdown").click()
    await expect(window.getByTestId("markdown-editor")).toBeVisible()

    await expect
      .poll(() => getMonacoValue(window), { timeout: 20_000 })
      .not.toBeNull()

    const generatedMarkdownPath = path.join(
      userDataDir,
      "marp",
      `notebook-${hashPath(tempNotebook)}.md`
    )
    const generatedPdfPath = path.join(
      userDataDir,
      "marp",
      `${hashPath(generatedMarkdownPath)}.pdf`
    )

    await expect
      .poll(() => fs.existsSync(generatedPdfPath), { timeout: 60_000 })
      .toBe(true)
    const pdfStatBefore = fs.statSync(generatedPdfPath).mtimeMs

    const customMarkdown = `---\nmarp: true\n---\n# Updated PDF\n`
    await setMonacoValue(window, customMarkdown)
    await expect
      .poll(() => getMonacoValue(window), { timeout: 10_000 })
      .toBe(customMarkdown)

    await expect
      .poll(() => fs.statSync(generatedPdfPath).mtimeMs, { timeout: 60_000 })
      .toBeGreaterThan(pdfStatBefore)
  } finally {
    await app.close()
  }
})

test("real: save as writes markdown file", async () => {
  test.setTimeout(180_000)
  test.skip(!hasRealDeps(), "Notebook fixture or python3 missing")

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "slides-pipeline-"))
  const tempNotebook = path.join(tempDir, "sample.ipynb")
  const savedMarkdown = path.join(tempDir, "custom.md")
  fs.copyFileSync(fixtureNotebook, tempNotebook)

  const { app, window } = await launchApp({
    E2E_NOTEBOOK_PATH: tempNotebook,
    E2E_THEME_PATH: fixtureTheme,
    E2E_MARKDOWN_SAVE_PATH: savedMarkdown,
  })

  try {
    await window.getByTestId("open-notebook").click()
    await expect(window.getByTestId("landing")).toBeHidden({ timeout: 30_000 })

    await window.getByTestId("toggle-markdown").click()
    await expect(window.getByTestId("markdown-editor")).toBeVisible()

    await expect
      .poll(() => getMonacoValue(window), { timeout: 20_000 })
      .not.toBeNull()

    const customMarkdown = `---\nmarp: true\n---\n# Saved file\n`
    await expect
      .poll(() => setMonacoValue(window, customMarkdown), { timeout: 20_000 })
      .toBe(true)
    await expect
      .poll(() => getMonacoValue(window), { timeout: 20_000 })
      .toBe(customMarkdown)

    await window.getByTestId("save-markdown").click()

    await expect
      .poll(() => fs.existsSync(savedMarkdown), { timeout: 10_000 })
      .toBe(true)
    await expect
      .poll(() => fs.readFileSync(savedMarkdown, "utf8"), { timeout: 10_000 })
      .toBe(customMarkdown)
  } finally {
    await app.close()
  }
})
