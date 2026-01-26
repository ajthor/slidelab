# SlideLab

Version: 0.1.2

Electron app for turning Jupyter notebooks into Marp slides with a live PDF preview.

## Getting started

1. Open a notebook (File → Open Notebook).
2. Edit slides in the Markdown panel.
3. Use “Save as…” if you want a separate markdown file that won’t be overwritten by notebook re-renders.
4. Load a custom theme via the Theme CSS panel (Load CSS).

## Gatekeeper (macOS)

After moving `SlideLab.app` to `/Applications`, run:

```bash
xattr -cr /Applications/SlideLab.app
```

This clears quarantine attributes so the app can launch.

## Support

If the preview isn’t updating, click “Rebuild PDF” in the toolbar.
