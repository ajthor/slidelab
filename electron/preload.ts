import { contextBridge, ipcRenderer } from "electron"

contextBridge.exposeInMainWorld("electronAPI", {
  openNotebookDialog: () => ipcRenderer.invoke("dialog:openNotebook"),
  openMarkdownDialog: () => ipcRenderer.invoke("dialog:openMarkdown"),
  openThemeDialog: () => ipcRenderer.invoke("dialog:openTheme"),
  launchNotebook: (path: string) =>
    ipcRenderer.invoke("jupyter:openNotebook", path),
  convertNotebook: (path: string) =>
    ipcRenderer.invoke("notebook:convert", path),
  watchNotebook: (path: string) => ipcRenderer.invoke("notebook:watch", path),
  getTheme: () => ipcRenderer.invoke("theme:get"),
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
})
