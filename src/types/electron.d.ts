export {}

declare global {
  interface Window {
    electronAPI?: {
      openNotebookDialog: () => Promise<string | null>
      openMarkdownDialog: () => Promise<string | null>
      openThemeDialog: () => Promise<string | null>
      saveMarkdownDialog: () => Promise<string | null>
      saveThemeDialog: () => Promise<string | null>
      getLastNotebook: () => Promise<string | null>
      setLastNotebook: (path: string | null) => Promise<void>
      addRecentNotebook: (path: string) => Promise<string[]>
      getRecentNotebooks: () => Promise<string[]>
      launchNotebook: (path: string) => Promise<{ url: string }>
      convertNotebook: (path: string) => Promise<{
        pdfUrl: string
        markdownPath: string
      }>
      watchNotebook: (path: string) => Promise<void>
      getTheme: () => Promise<string>
      getMarkdown: (path: string) => Promise<string>
      saveMarkdown: (payload: {
        filePath: string
        content: string
      }) => Promise<void>
      loadTheme: (path: string) => Promise<string>
      saveTheme: (content: string) => Promise<void>
      convertMarkdown: (path: string) => Promise<{ pdfUrl: string }>
      watchMarkdown: (path: string) => Promise<void>
      onMarpUpdated: (
        callback: (payload: { pdfUrl: string; markdownPath?: string }) => void
      ) => (() => void) | void
      onStatusUpdated: (
        callback: (payload: {
          message: string
          level: "info" | "success" | "error"
        }) => void
      ) => (() => void) | void
      onMenuOpenNotebook: (callback: () => void) => (() => void) | void
      onMenuRebuildPdf: (callback: () => void) => (() => void) | void
      onMenuLoadTheme: (callback: () => void) => (() => void) | void
      onMenuSaveTheme: (callback: () => void) => (() => void) | void
      onMenuSaveMarkdown: (callback: () => void) => (() => void) | void
      onMenuOpenRecentNotebook: (callback: (path: string) => void) => (() => void) | void
      setMenuState: (payload: {
        hasNotebook: boolean
        hasMarkdown: boolean
        hasTheme: boolean
        recentNotebooks?: string[]
      }) => Promise<void>
    }
  }
}

declare namespace JSX {
  interface IntrinsicElements {
    webview: React.DetailedHTMLProps<
      React.HTMLAttributes<HTMLWebViewElement>,
      HTMLWebViewElement
    > & {
      src?: string
      allowpopups?: string
    }
  }
}

interface HTMLWebViewElement extends HTMLElement {
  src: string
}
