#!/usr/bin/env node
/**
 * Automated Markdown/Notebook to Slides Converter (Node.js)
 *
 * Mirrors the previous Python converter behavior:
 * - Converts .ipynb or .md to Marp slides
 * - Extracts PNG outputs into a local images/ folder
 * - Applies cleanup rules and a title slide
 */

import fs from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

class SlideConverter {
  constructor(inputPath, outputPath = null) {
    this.inputPath = path.resolve(inputPath)
    this.outputPath = outputPath ? path.resolve(outputPath) : null
    this.fileType = path.extname(this.inputPath)

    if (!this.outputPath) {
      const baseName = path.basename(this.inputPath, this.fileType)
      const slidesFolder = path.join(path.dirname(this.inputPath), "slides")
      fs.mkdirSync(slidesFolder, { recursive: true })
      this.outputPath = path.join(slidesFolder, `${baseName}.md`)
    }

    this.slidesDir = path.dirname(this.outputPath)
    fs.mkdirSync(this.slidesDir, { recursive: true })
    this.imagesDir = path.join(this.slidesDir, "images")
    fs.mkdirSync(this.imagesDir, { recursive: true })

    const stem = path.basename(this.inputPath, this.fileType)
    this.imagePrefix = stem.replace(/[-\s]/g, "_")
    this.imageCounter = 1
    this.slides = []
  }

  convert() {
    console.log(`Converting: ${this.inputPath}`)
    console.log(`Output: ${this.outputPath}`)
    console.log("")

    if (this.fileType === ".ipynb") {
      return this.convertNotebook()
    }
    if (this.fileType === ".md") {
      return this.convertMarkdown()
    }
    throw new Error(`Unsupported file type: ${this.fileType}`)
  }

  convertNotebook() {
    console.log("📓 Processing Jupyter notebook...")
    const notebook = JSON.parse(fs.readFileSync(this.inputPath, "utf-8"))
    const title = this.extractNotebookTitle(notebook)
    this.addFrontmatter(title)
    this.processNotebookCells(notebook)
    this.writeOutput()
    return this.outputPath
  }

  convertMarkdown() {
    console.log("📝 Processing Markdown file...")
    const content = fs.readFileSync(this.inputPath, "utf-8")
    const title = this.extractMarkdownTitle(content)
    this.addFrontmatter(title)
    this.processMarkdownContent(content)
    this.writeOutput()
    return this.outputPath
  }

  extractNotebookTitle(notebook) {
    for (const cell of notebook.cells || []) {
      if (cell.cell_type === "markdown") {
        const source = this.readCellSource(cell)
        const match = source.match(/^#\s+(.+)$/m)
        if (match) return match[1].trim()
      }
    }
    return this.defaultTitle()
  }

  extractMarkdownTitle(content) {
    const match = content.match(/^#\s+(.+)$/m)
    if (match) return match[1].trim()
    return this.defaultTitle()
  }

  defaultTitle() {
    return path
      .basename(this.inputPath, this.fileType)
      .replace(/[-_]/g, " ")
      .replace(/\s+/g, " ")
      .trim()
      .replace(/\b\w/g, (c) => c.toUpperCase())
  }

  addFrontmatter(title) {
    const frontmatter = `---\nmarp: true\ntheme: custom\nmath: katex\npaginate: true\n---\n\n\n<!-- _class: title -->\n\n`
    const singleLineTitle = title.split(/\r?\n/).join(" ").trim()
    this.slides.push(frontmatter)
    this.slides.push(`# ${singleLineTitle}\n\n---\n\n`)
  }

  writeOutput() {
    const fullContent = this.slides.join("")
    fs.writeFileSync(this.outputPath, fullContent, "utf-8")
    const slideCount = (fullContent.match(/\n---\n/g) || []).length
    const imageCount = this.imageCounter - 1
    console.log("✓ Conversion complete!")
    console.log(`  Output: ${this.outputPath}`)
    console.log(`  Slides: ${slideCount}`)
    console.log(`  Images: ${imageCount}`)
    console.log("")
  }

  processNotebookCells(notebook) {
    const cells = notebook.cells || []
    let skipFirstTitle = true
    let firstContent = true

    for (const cell of cells) {
      if (cell.cell_type === "markdown") {
        const source = this.readCellSource(cell)
        if (skipFirstTitle && source.trim().startsWith("# ")) {
          skipFirstTitle = false
          continue
        }
        const cleaned = this.cleanMarkdown(source)
        if (!cleaned) continue
        if (!firstContent) {
          this.slides.push("\n---\n\n")
        }
        this.slides.push(cleaned)
        this.slides.push("\n\n")
        firstContent = false
      }

      if (cell.cell_type === "code") {
        const outputs = cell.outputs || []
        const imagePaths = []
        const title = this.extractCodeTitle(cell)

        for (const output of outputs) {
          const imgPath = this.extractImage(output)
          if (imgPath) imagePaths.push(imgPath)
        }

        if (imagePaths.length) {
          if (title) {
            this.slides.push(`## ${title}\n\n`)
          }
          for (const imgPath of imagePaths) {
            this.slides.push(`![width:500px](${imgPath})\n\n`)
          }
          firstContent = false
        }
      }
    }
  }

  processMarkdownContent(content) {
    let cleaned = content.replace(/^---\n[\s\S]*?\n---\n/, "")
    cleaned = cleaned.replace(/^\s*#\s+.+\n/, "")
    cleaned = cleaned.trim()
    if (!cleaned) return
    const finalText = this.cleanMarkdown(cleaned)
    if (finalText) {
      this.slides.push(finalText)
      this.slides.push("\n\n")
    }
  }

  cleanMarkdown(text) {
    let cleaned = text
    cleaned = cleaned.replace(/^\s*---\s*$/gm, "")
    cleaned = cleaned.replace(
      /<a href="https:\/\/chat\.openai\.com\/.*?<\/a>/gs,
      ""
    )
    cleaned = cleaned.replace(
      /<a href="https:\/\/colab\.research\.google\.com\/.*?<\/a>/gs,
      ""
    )
    cleaned = cleaned.replace(
      /\[!\[.*?\]\(https:\/\/colab\.research\.google\.com\/assets\/colab-badge\.svg\)\]\(https:\/\/colab\.research\.google\.com\/[^)]+\)/g,
      ""
    )
    cleaned = cleaned.replace(
      /!!!\s+(\w+)\s+"([^"]+)"\n\s+(.+?)(?=\n\n|\Z)/gs,
      "> **$2**\n>\n> $3"
    )
    return cleaned.trim()
  }

  extractImage(output) {
    if (!output || !output.data) return null
    const data = output.data
    if (!data["image/png"]) return null
    const imgData = Array.isArray(data["image/png"])
      ? data["image/png"].join("")
      : data["image/png"]
    const imgBytes = Buffer.from(imgData, "base64")
    const imgFilename = `${this.imagePrefix}_${String(this.imageCounter).padStart(2, "0")}.png`
    const imgPath = path.join(this.imagesDir, imgFilename)
    fs.writeFileSync(imgPath, imgBytes)
    console.log(`  ✓ Extracted: ${imgFilename}`)
    this.imageCounter += 1
    return `images/${imgFilename}`
  }

  extractCodeTitle(cell) {
    const source = this.readCellSource(cell)
    const lines = source.split(/\r?\n/)
    for (const line of lines) {
      const stripped = line.trim()
      if (!stripped) continue
      if (stripped.startsWith("#")) {
        let title = stripped.replace(/^#+\s*/, "").trim()
        if (title.toLowerCase().startsWith("@title")) {
          title = title.slice("@title".length).trim()
        }
        return title || null
      }
      break
    }
    return null
  }

  readCellSource(cell) {
    const source = cell.source || ""
    return Array.isArray(source) ? source.join("") : String(source)
  }
}

const main = () => {
  const inputPath = process.argv[2]
  const outputPath = process.argv[3] || null

  if (!inputPath) {
    console.log("Usage: node convert_to_slides.mjs <input_file> [output_file]")
    process.exit(1)
  }

  if (!fs.existsSync(inputPath)) {
    console.log(`Error: File not found: ${inputPath}`)
    process.exit(1)
  }

  const converter = new SlideConverter(inputPath, outputPath)
  const outputFile = converter.convert()
  console.log("=".repeat(60))
  console.log("Next steps:")
  console.log(`  1. Review: ${outputFile}`)
  console.log("  2. Generate PDF: marp <file>.md --pdf --allow-local-files")
  console.log("=".repeat(60))
}

main()
