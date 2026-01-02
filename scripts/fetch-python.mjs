import { execFileSync } from "node:child_process"
import fs from "node:fs"
import path from "node:path"

const rootDir = path.resolve(new URL(".", import.meta.url).pathname, "..")
const resourcesDir = path.join(rootDir, "resources")
const pythonDir = path.join(resourcesDir, "python")

const defaultUrl =
  "https://github.com/indygreg/python-build-standalone/releases/download/20240107/cpython-3.12.1+20240107-macos-universal2-install_only.tar.gz"
const archiveUrl = process.env.PYTHON_STANDALONE_URL || defaultUrl
const archivePath = path.join(resourcesDir, "python.tar.gz")

fs.mkdirSync(resourcesDir, { recursive: true })
console.log(`Downloading Python from ${archiveUrl}`)
execFileSync("curl", ["-L", archiveUrl, "-o", archivePath], {
  stdio: "inherit",
})

fs.rmSync(pythonDir, { recursive: true, force: true })
fs.mkdirSync(pythonDir, { recursive: true })

console.log("Extracting Python runtime...")
execFileSync("tar", ["-xzf", archivePath, "-C", pythonDir, "--strip-components=1"], {
  stdio: "inherit",
})

fs.rmSync(archivePath, { force: true })
console.log(`Python runtime ready at ${pythonDir}`)
