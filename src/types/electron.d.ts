export {}

declare global {
  interface Window {
    electronAPI?: {
      openNotebookDialog: () => Promise<string | null>
      openMarkdownDialog: () => Promise<string | null>
      launchNotebook: (path: string) => Promise<{ url: string }>
      convertNotebook: (path: string) => Promise<{
        pdfUrl: string
        markdownPath: string
      }>
      watchNotebook: (path: string) => Promise<void>
      convertMarkdown: (path: string) => Promise<{ pdfUrl: string }>
      watchMarkdown: (path: string) => Promise<void>
      installPackages: (payload: {
        notebookPath: string
        packages: string[]
      }) => Promise<void>
      onMarpUpdated: (
        callback: (payload: { pdfUrl: string; markdownPath?: string }) => void
      ) => (() => void) | void
      onStatusUpdated: (
        callback: (payload: {
          message: string
          level: "info" | "success" | "error"
        }) => void
      ) => (() => void) | void
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
