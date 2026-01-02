import { describe, expect, it } from "vitest"
import { defaultThemeCss } from "../../electron/utils/theme"

describe("defaultThemeCss", () => {
  it("includes a marp theme header", () => {
    expect(defaultThemeCss).toContain("@theme")
  })

  it("defines a base section style", () => {
    expect(defaultThemeCss).toContain("section")
  })
})
