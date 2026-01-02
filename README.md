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

When a notebook is opened (File → Open Notebook), the app converts it to slides-friendly Markdown and
then runs Marp to generate a PDF preview. Changes to the `.ipynb` file are
watched and debounced before re-generating the PDF.

Notebook conversion uses `resources/scripts/convert_to_slides.py` for the
Markdown pipeline.

## Theme editor

Use the top bar toggle to switch the left panel to a CSS editor. The stylesheet
is saved to the app's theme file and automatically applied to Marp conversions.
Use "Load CSS" to import a theme file from disk and "Save as..." to export a copy.

## Markdown editor

The left panel can switch to a Markdown editor for the generated slides output.
Edits auto-save and re-run the Marp conversion. Use “Save as…” to persist a
separate Markdown file so notebook re-renders do not overwrite your edits.

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

The real E2E test will run if `python3` is available (or `PYTHON_PATH` is set),
and uses the fixture notebook to exercise the full conversion pipeline.

```bash
npm run test:unit
```

Run both suites with:

```bash
npm test
```
