#!/usr/bin/env python3
"""
Automated Markdown/Notebook to Slides Converter

Automatically converts lecture notes or Jupyter notebooks to Marp slides
with minimal manual intervention.

Features:
- Extracts existing plots from notebook outputs (no regeneration)
- Smart slide break detection
- Automatic section dividers
- Handles both .md and .ipynb files

Usage:
    python convert_to_slides.py lectures/First_Order_Systems/First_Order_Systems.ipynb
    python convert_to_slides.py lectures/Linear_Systems/Linear_Systems.ipynb
"""

import sys
import os
import re
import json
import base64
from pathlib import Path


class SlideConverter:
    def __init__(self, input_path, output_path=None):
        self.input_path = Path(input_path).resolve()
        self.output_path = Path(output_path).resolve() if output_path else None

        # Determine file type
        self.file_type = self.input_path.suffix

        # Auto-generate output path if not provided
        if not self.output_path:
            base_name = self.input_path.stem
            slides_folder = self.input_path.parent / "slides"
            slides_folder.mkdir(parents=True, exist_ok=True)
            self.output_path = slides_folder / f"{base_name}.md"

        # Use the output directory to anchor slide and image assets
        self.slides_dir = self.output_path.parent
        self.slides_dir.mkdir(parents=True, exist_ok=True)
        self.images_dir = self.slides_dir / "images"
        self.images_dir.mkdir(exist_ok=True)

        self.image_prefix = self.input_path.stem.replace("-", "_").replace(" ", "_")
        self.image_counter = 1
        self.slides = []

    def convert(self):
        """Main conversion method - dispatches based on file type"""
        print(f"Converting: {self.input_path}")
        print(f"Output: {self.output_path}")
        print()

        if self.file_type == ".ipynb":
            return self._convert_notebook()
        elif self.file_type == ".md":
            return self._convert_markdown()
        else:
            raise ValueError(f"Unsupported file type: {self.file_type}")

    def _convert_notebook(self):
        """Convert Jupyter notebook to slides"""
        print("📓 Processing Jupyter notebook...")

        with open(self.input_path, "r", encoding="utf-8") as f:
            notebook = json.load(f)

        # Extract title
        title = self._extract_notebook_title(notebook)

        # Add frontmatter
        self._add_frontmatter(title)

        # Process cells with smart slide breaks
        self._process_notebook_cells(notebook)

        # Write output
        self._write_output()

        return self.output_path

    def _convert_markdown(self):
        """Convert Markdown to slides"""
        print("📝 Processing Markdown file...")

        with open(self.input_path, "r", encoding="utf-8") as f:
            content = f.read()

        # Extract title
        title = self._extract_markdown_title(content)

        # Add frontmatter
        self._add_frontmatter(title)

        # Process markdown content with smart slide breaks
        self._process_markdown_content(content)

        # Write output
        self._write_output()

        return self.output_path

    def _extract_notebook_title(self, notebook):
        """Extract title from first markdown cell"""
        for cell in notebook["cells"]:
            if cell["cell_type"] == "markdown":
                source = (
                    "".join(cell["source"])
                    if isinstance(cell["source"], list)
                    else cell["source"]
                )
                match = re.match(r"^#\s+(.+)$", source, re.MULTILINE)
                if match:
                    return match.group(1).strip()
        return self.input_path.stem.replace("-", " ").replace("_", " ").title()

    def _extract_markdown_title(self, content):
        """Extract title from first # header"""
        match = re.search(r"^#\s+(.+)$", content, re.MULTILINE)
        if match:
            return match.group(1).strip()
        return self.input_path.stem.replace("-", " ").replace("_", " ").title()

    def _add_frontmatter(self, title):
        """Add Marp frontmatter"""
        frontmatter = """---
marp: true
theme: custom
math: katex
paginate: true
---


<!-- _class: title -->

"""
        # Keep the title as a single line without subtitle splitting.
        single_line_title = " ".join(title.splitlines()).strip()
        self.slides.append(frontmatter)
        self.slides.append(f"# {single_line_title}\n\n---\n\n")

    def _write_output(self):
        """Write slides to output file"""
        full_content = "".join(self.slides)

        with open(self.output_path, "w", encoding="utf-8") as f:
            f.write(full_content)

        slide_count = full_content.count("\n---\n")
        image_count = self.image_counter - 1

        print(f"✓ Conversion complete!")
        print(f"  Output: {self.output_path}")
        print(f"  Slides: {slide_count}")
        print(f"  Images: {image_count}")
        print()

    def _process_notebook_cells(self, notebook):
        """Process notebook cells with simple slide boundaries"""
        cells = notebook["cells"]
        skip_first_title = True
        first_content = True

        for cell in cells:
            cell_type = cell["cell_type"]

            if cell_type == "markdown":
                source = (
                    "".join(cell["source"])
                    if isinstance(cell["source"], list)
                    else cell["source"]
                )

                # Skip first title (already in frontmatter)
                if skip_first_title and source.strip().startswith("# "):
                    skip_first_title = False
                    continue

                # Clean and add markdown content
                cleaned = self._clean_markdown(source)
                if not cleaned:
                    continue
                if not first_content:
                    self.slides.append("\n---\n\n")
                self.slides.append(cleaned)
                self.slides.append("\n\n")
                first_content = False

            elif cell_type == "code":
                # Extract images from outputs
                outputs = cell.get("outputs", [])
                image_paths = []
                title = self._extract_code_title(cell)

                for output in outputs:
                    img_path = self._extract_image(output)
                    if img_path:
                        image_paths.append(img_path)

                if image_paths:
                    if title:
                        self.slides.append(f"## {title}\n\n")
                    for img_path in image_paths:
                        self.slides.append(f"![width:500px]({img_path})\n\n")
                    first_content = False

    def _process_markdown_content(self, content):
        """Process markdown content without automatic slide splitting"""
        # Remove frontmatter if exists
        content = re.sub(r"^---\n.*?\n---\n", "", content, flags=re.DOTALL)
        content = content.strip()
        if not content:
            return

        # Drop the first H1 title (already in frontmatter)
        content = re.sub(r"^\s*#\s+.+\n", "", content, count=1)
        content = content.strip()
        if not content:
            return

        cleaned = self._clean_markdown(content)
        if cleaned:
            self.slides.append(cleaned)
            self.slides.append("\n\n")

    def _add_section_divider(self, section_title):
        """Add a title slide for major sections"""
        # Parse "Example 1: Title" format
        match = re.match(r"(Example\s+\d+):\s*(.+)", section_title, re.IGNORECASE)
        if match:
            main = match.group(1)
            sub = match.group(2)
            self.slides.append(
                f"\n---\n\n<!-- _class: title -->\n\n# {main}\n## {sub}\n\n---\n\n"
            )
        else:
            self.slides.append(
                f"\n---\n\n<!-- _class: title -->\n\n# {section_title}\n\n---\n\n"
            )

    def _clean_markdown(self, text):
        """Clean markdown text for slides"""
        # Remove in-cell slide separators to keep 1 cell per slide
        text = re.sub(r"^\s*---\s*$", "", text, flags=re.MULTILINE)

        # Remove curiosity badges and external links
        text = re.sub(
            r'<a href="https://chat\.openai\.com/.*?</a>', "", text, flags=re.DOTALL
        )
        text = re.sub(
            r'<a href="https://colab\.research\.google\.com/.*?</a>',
            "",
            text,
            flags=re.DOTALL,
        )
        text = re.sub(
            r"\[!\[.*?\]\(https://colab\.research\.google\.com/assets/colab-badge\.svg\)\]\(https://colab\.research\.google\.com/[^)]+\)",
            "",
            text,
        )

        # Remove MkDocs admonitions - convert to blockquotes
        text = re.sub(
            r'!!!\s+(\w+)\s+"([^"]+)"\n\s+(.+?)(?=\n\n|\Z)',
            r"> **\2**\n>\n> \3",
            text,
            flags=re.DOTALL,
        )

        # # Remove learning objectives (too verbose for slides)
        # text = re.sub(
        #     r'!!!\s+abstract\s+"Learning Objectives".*?(?=\n##|\Z)',
        #     '',
        #     text,
        #     flags=re.DOTALL | re.IGNORECASE
        # )

        # # Simplify interactive widget comments
        # text = re.sub(
        #     r'\*\[Interactive visualization.*?\]\*',
        #     '',
        #     text,
        #     flags=re.IGNORECASE
        # )

        # # Remove <div> tags for interactive components
        # text = re.sub(r'<div id=".*?"></div>', '', text)
        # text = re.sub(r'<script type="text/babel">.*?</script>', '', text, flags=re.DOTALL)

        return text.strip()

    def _extract_image(self, output):
        """Extract image from notebook output"""
        if "data" not in output:
            return None

        data = output["data"]

        # Check for PNG image
        if "image/png" in data:
            img_data = data["image/png"]
            img_bytes = base64.b64decode(img_data)

            # Save as PNG
            img_filename = f"{self.image_prefix}_{self.image_counter:02d}.png"
            img_path = self.images_dir / img_filename

            with open(img_path, "wb") as f:
                f.write(img_bytes)

            print(f"  ✓ Extracted: {img_filename}")
            self.image_counter += 1

            return f"images/{img_filename}"

        return None

    def _extract_code_title(self, cell):
        """Extract a title from the first comment line in a code cell."""
        source = cell.get("source", "")
        if isinstance(source, list):
            lines = source
        else:
            lines = source.splitlines()

        for line in lines:
            stripped = line.strip()
            if not stripped:
                continue
            if stripped.startswith("#"):
                title = stripped.lstrip("#").strip()
                if title.lower().startswith("@title"):
                    title = title[len("@title") :].strip()
                return title or None
            break
        return None


def main():
    if len(sys.argv) < 2:
        print("Usage: python convert_to_slides.py <input_file> [output_file]")
        print()
        print("Examples:")
        print(
            "  python convert_to_slides.py lectures/First_Order_Systems/First_Order_Systems.ipynb"
        )
        print(
            "  python convert_to_slides.py lectures/Linear_Systems/Linear_Systems.ipynb"
        )
        print("  python convert_to_slides.py notebook.ipynb custom-output.md")
        sys.exit(1)

    input_path = sys.argv[1]
    output_path = sys.argv[2] if len(sys.argv) > 2 else None

    if not os.path.exists(input_path):
        print(f"Error: File not found: {input_path}")
        sys.exit(1)

    # Convert
    converter = SlideConverter(input_path, output_path)
    output_file = converter.convert()

    print("=" * 60)
    print("Next steps:")
    print(f"  1. Review: {output_file}")
    print(f"  2. Generate PDF: marp {output_file.name} --pdf --allow-local-files")
    print("=" * 60)


if __name__ == "__main__":
    main()
