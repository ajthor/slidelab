import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { readSettings, writeSettings } from "../../electron/utils/settings"

describe("settings utils", () => {
  it("writes and reads settings", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slides-settings-"))
    const settingsPath = path.join(dir, "settings.json")

    await writeSettings(settingsPath, { lastNotebook: "/tmp/example.ipynb" })
    const settings = await readSettings(settingsPath)

    expect(settings.lastNotebook).toBe("/tmp/example.ipynb")
  })

  it("returns empty settings when missing", async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "slides-settings-"))
    const settingsPath = path.join(dir, "settings.json")

    const settings = await readSettings(settingsPath)
    expect(settings.lastNotebook).toBeUndefined()
  })
})
