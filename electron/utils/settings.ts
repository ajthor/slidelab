import fs from "node:fs"

export type AppSettings = {
  lastNotebook?: string
  recentNotebooks?: string[]
}

export const readSettings = async (settingsPath: string): Promise<AppSettings> => {
  try {
    const raw = await fs.promises.readFile(settingsPath, "utf8")
    return JSON.parse(raw) as AppSettings
  } catch {
    return {}
  }
}

export const writeSettings = async (
  settingsPath: string,
  partial: AppSettings
): Promise<void> => {
  const current = await readSettings(settingsPath)
  const updated = { ...current, ...partial }
  await fs.promises.writeFile(settingsPath, JSON.stringify(updated, null, 2))
}

export const addRecentNotebook = async (
  settingsPath: string,
  notebookPath: string,
  limit = 8
): Promise<string[]> => {
  const settings = await readSettings(settingsPath)
  const current = settings.recentNotebooks || []
  const next = [notebookPath, ...current.filter((item) => item !== notebookPath)]
  const trimmed = next.slice(0, limit)
  await writeSettings(settingsPath, { recentNotebooks: trimmed })
  return trimmed
}
