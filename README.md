# Slides Application

Electron + React/Vite desktop app for JupyterLab notebooks alongside Marp PDF preview.

## Development

```bash
npm install
npm run dev:electron
```

## Bundled Python

The app expects a standalone Python runtime under `resources/python`.

```bash
npm run setup:python
```

You can override the download URL:

```bash
PYTHON_STANDALONE_URL="https://example.com/python.tar.gz" npm run setup:python
```

## Notebook to Marp

When a notebook is opened, the app converts it to Markdown via `nbconvert` and
then runs Marp to generate a PDF preview. Changes to the `.ipynb` file are
watched and debounced before re-generating the PDF.

## Marp (standalone)

Marp CLI is bundled via `@marp-team/marp-cli`. It runs locally to generate a PDF
whenever the selected markdown file changes (debounced) or when you click Convert.

## Build

```bash
npm run build:electron
```

## Tests

```bash
npm run test:e2e
```

The E2E tests run Electron in a mock mode (no Python/Jupyter/Marp) using
fixtures in `resources/fixtures`.
