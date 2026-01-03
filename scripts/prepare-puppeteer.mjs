import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { spawnSync } from "node:child_process"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const repoRoot = path.resolve(__dirname, "..")
const cacheDir = path.join(repoRoot, "resources", "puppeteer")
const installScript = path.join(
  repoRoot,
  "node_modules",
  "puppeteer",
  "install.mjs"
)

const findBundledChromium = (rootDir) => {
  const stack = [{ dir: rootDir, depth: 0 }]
  const maxDepth = 7

  while (stack.length) {
    const current = stack.pop()
    if (!current) continue
    const { dir, depth } = current
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      continue
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (entry.name.endsWith(".app")) {
          const appRoot = path.join(dir, entry.name)
          const macosDir = path.join(appRoot, "Contents", "MacOS")
          const chromiumBinary = path.join(macosDir, "Chromium")
          const chromeTestingBinary = path.join(
            macosDir,
            "Google Chrome for Testing"
          )
          if (fs.existsSync(chromiumBinary)) {
            return chromiumBinary
          }
          if (fs.existsSync(chromeTestingBinary)) {
            return chromeTestingBinary
          }
        }
        if (depth < maxDepth) {
          stack.push({ dir: path.join(dir, entry.name), depth: depth + 1 })
        }
      } else if (entry.isFile() && entry.name === "Chromium") {
        return path.join(dir, entry.name)
      }
    }
  }

  return null
}

fs.mkdirSync(cacheDir, { recursive: true })

if (!fs.existsSync(installScript)) {
  throw new Error(`Puppeteer install script not found at ${installScript}`)
}

const result = spawnSync(process.execPath, [installScript], {
  stdio: "inherit",
  env: {
    ...process.env,
    PUPPETEER_CACHE_DIR: cacheDir,
  },
})

if (result.status !== 0) {
  throw new Error(`Puppeteer install failed with code ${result.status}`)
}

const chromiumPath = findBundledChromium(cacheDir)
if (!chromiumPath) {
  throw new Error("Chromium binary not found after Puppeteer install.")
}

console.log(`Puppeteer Chromium ready at ${chromiumPath}`)
