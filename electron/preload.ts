import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("electronAPI", {
  openNotebookDialog: () => ipcRenderer.invoke("dialog:openNotebook"),
  openMarkdownDialog: () => ipcRenderer.invoke("dialog:openMarkdown"),
  openThemeDialog: () => ipcRenderer.invoke("dialog:openTheme"),
  saveMarkdownDialog: () => ipcRenderer.invoke("dialog:saveMarkdown"),
  saveThemeDialog: () => ipcRenderer.invoke("dialog:saveTheme"),
  launchNotebook: (path: string) =>
    ipcRenderer.invoke("jupyter:openNotebook", path),
  convertNotebook: (path: string) =>
    ipcRenderer.invoke("notebook:convert", path),
  watchNotebook: (path: string) => ipcRenderer.invoke("notebook:watch", path),
  getTheme: () => ipcRenderer.invoke("theme:get"),
  getMarkdown: (path: string) => ipcRenderer.invoke("markdown:get", path),
  saveMarkdown: (payload: { filePath: string; content: string }) =>
    ipcRenderer.invoke("markdown:save", payload),
  loadTheme: (path: string) => ipcRenderer.invoke("theme:load", path),
  saveTheme: (content: string) => ipcRenderer.invoke("theme:save", content),
  convertMarkdown: (path: string) => ipcRenderer.invoke("marp:convert", path),
  watchMarkdown: (path: string) => ipcRenderer.invoke("marp:watch", path),
  onMarpUpdated: (callback: (payload: { pdfUrl: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { pdfUrl: string }) =>
      callback(payload)
    ipcRenderer.on("marp:updated", listener)
    return () => ipcRenderer.removeListener("marp:updated", listener)
  },
  onStatusUpdated: (
    callback: (payload: { message: string; level: "info" | "success" | "error" }) => void
  ) => {
    const listener = (
      _event: Electron.IpcRendererEvent,
      payload: { message: string; level: "info" | "success" | "error" }
    ) => callback(payload)
    ipcRenderer.on("status:update", listener)
    return () => ipcRenderer.removeListener("status:update", listener)
  },
  onMenuOpenNotebook: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on("menu:openNotebook", listener)
    return () => ipcRenderer.removeListener("menu:openNotebook", listener)
  },
  onMenuRebuildPdf: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on("menu:rebuildPdf", listener)
    return () => ipcRenderer.removeListener("menu:rebuildPdf", listener)
  },
  onMenuLoadTheme: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on("menu:loadTheme", listener)
    return () => ipcRenderer.removeListener("menu:loadTheme", listener)
  },
  onMenuSaveTheme: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on("menu:saveTheme", listener)
    return () => ipcRenderer.removeListener("menu:saveTheme", listener)
  },
  onMenuSaveMarkdown: (callback: () => void) => {
    const listener = () => callback()
    ipcRenderer.on("menu:saveMarkdown", listener)
    return () => ipcRenderer.removeListener("menu:saveMarkdown", listener)
  },
  setMenuState: (payload: {
    hasNotebook: boolean
    hasMarkdown: boolean
    hasTheme: boolean
  }) => ipcRenderer.invoke("menu:setState", payload),
})
