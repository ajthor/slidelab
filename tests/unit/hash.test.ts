import { describe, expect, it } from "vitest"
import { hashPath } from "../../electron/utils/hash"

describe("hashPath", () => {
  it("returns a stable 16-char hash", () => {
    const result = hashPath("/tmp/example.ipynb")
    expect(result).toHaveLength(16)
    expect(result).toMatch(/^[a-f0-9]{16}$/)
    expect(result).toBe(hashPath("/tmp/example.ipynb"))
  })

  it("changes when input changes", () => {
    expect(hashPath("a")).not.toBe(hashPath("b"))
  })
})
