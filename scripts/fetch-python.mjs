import { execFileSync } from "node:child_process"
import crypto from "node:crypto"
import fs from "node:fs"
import path from "node:path"

const rootDir = path.resolve(new URL(".", import.meta.url).pathname, "..")
const resourcesDir = path.join(rootDir, "resources")
const pythonDir = path.join(resourcesDir, "python")

const defaultUrl =
  "https://github.com/indygreg/python-build-standalone/releases/download/20240107/cpython-3.12.1+20240107-macos-universal2-install_only.tar.gz"
const archiveUrl =
  process.env.PYTHON_STANDALONE_URL || defaultUrl
const fallbackUrls = process.env.PYTHON_STANDALONE_FALLBACKS
  ? process.env.PYTHON_STANDALONE_FALLBACKS.split(",").map((url) => url.trim())
  : []
const archiveUrls = [archiveUrl, ...fallbackUrls]
const archivePath = path.join(resourcesDir, "python.tar.gz")
const expectedSha = process.env.PYTHON_STANDALONE_SHA256

const validateArchive = (filePath) => {
  const stat = fs.statSync(filePath)
  if (stat.size < 10_000_000) {
    throw new Error(`Archive too small (${stat.size} bytes).`)
  }
  execFileSync("tar", ["-tzf", filePath], { stdio: "ignore" })
  if (expectedSha) {
    const hash = crypto.createHash("sha256")
    const data = fs.readFileSync(filePath)
    hash.update(data)
    const digest = hash.digest("hex")
    if (digest !== expectedSha) {
      throw new Error(`SHA256 mismatch. Expected ${expectedSha}, got ${digest}.`)
    }
  }
}

const hasPython = () =>
  fs.existsSync(path.join(pythonDir, "bin", "python3")) ||
  fs.existsSync(path.join(pythonDir, "bin", "python"))

fs.mkdirSync(resourcesDir, { recursive: true })

if (hasPython()) {
  console.log(`Python runtime already present at ${pythonDir}`)
  process.exit(0)
}

if (fs.existsSync(archivePath)) {
  console.log("Found existing archive, validating...")
  try {
    validateArchive(archivePath)
  } catch (error) {
    console.warn("Archive validation failed, re-downloading.")
    fs.rmSync(archivePath, { force: true })
  }
}

if (!fs.existsSync(archivePath)) {
  let downloaded = false
  for (const url of archiveUrls) {
    if (!url) continue
    console.log(`Downloading Python from ${url}`)
    try {
      execFileSync(
        "curl",
        [
          "-fL",
          "--retry",
          "3",
          "--retry-all-errors",
          "--connect-timeout",
          "20",
          "--max-time",
          "300",
          "-o",
          archivePath,
          url,
        ],
        { stdio: "inherit" }
      )
      validateArchive(archivePath)
      downloaded = true
      break
    } catch (error) {
      console.warn(`Download failed for ${url}`)
      if (fs.existsSync(archivePath)) {
        fs.rmSync(archivePath, { force: true })
      }
    }
  }
  if (!downloaded) {
    throw new Error(
      "Failed to download a valid Python archive. Set PYTHON_STANDALONE_URL or PYTHON_STANDALONE_FALLBACKS."
    )
  }
} else {
  console.log("Using validated cached archive.")
}

fs.rmSync(pythonDir, { recursive: true, force: true })
fs.mkdirSync(pythonDir, { recursive: true })

console.log("Extracting Python runtime...")
execFileSync(
  "tar",
  ["-xzf", archivePath, "-C", pythonDir, "--strip-components=1"],
  {
    stdio: "inherit",
  }
)

fs.rmSync(archivePath, { force: true })
console.log(`Python runtime ready at ${pythonDir}`)
