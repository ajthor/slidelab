import fs from "node:fs"

export type AppSettings = {
  lastNotebook?: string
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
