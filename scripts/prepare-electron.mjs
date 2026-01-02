import fs from "node:fs"
import path from "node:path"

const rootDir = path.resolve(new URL(".", import.meta.url).pathname, "..")
const outDir = path.join(rootDir, "dist-electron")

fs.mkdirSync(outDir, { recursive: true })
const packageJsonPath = path.join(outDir, "package.json")

const payload = {
  type: "commonjs",
}

fs.writeFileSync(packageJsonPath, JSON.stringify(payload, null, 2))
