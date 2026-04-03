/**
 * @module tests/utils/format
 * Tests for terminal output formatter utilities.
 */

import { describe, it, expect } from "vitest"
import {
  formatStashLine,
  formatSize,
  formatStashChoice,
  formatStashDetails,
  truncate,
} from "../../src/utils/format.js"
import type { StashMetadata } from "../../src/schemas.js"

// ─── Test fixture ─────────────────────────────────────────────────────────────

const mockStash: StashMetadata = {
  id: "2026-03-12_01-05_k7x2",
  project: "my-app",
  timestamp: "2026-03-12T01:05:00.000Z",
  message: "planning docs",
  tags: ["docs", "planning"],
  branch: "main",
  commit: "abc1234567890",
  user: "gab@macmini",
  files: [
    { name: "README.md", size: 1024, hash: "sha256:a1b2c3d4e5f6" },
    { name: "notes.txt", size: 512, hash: "sha256:b2c3d4e5f6a1" },
  ],
  totalSize: 1536,
  compressed: false,
}

const singleFileStash: StashMetadata = {
  ...mockStash,
  id: "2026-03-13_10-00_abcd",
  tags: [],
  files: [{ name: "todo.md", size: 256, hash: "sha256:c3d4e5f6a1b2" }],
  totalSize: 256,
}

// ─── formatStashLine ─────────────────────────────────────────────────────────

describe("formatStashLine", () => {
  it("includes the stash index", () => {
    expect(formatStashLine(mockStash, 0)).toContain("[0]")
    expect(formatStashLine(mockStash, 3)).toContain("[3]")
  })

  it("includes the stash message", () => {
    expect(formatStashLine(mockStash, 0)).toContain("planning docs")
  })

  it("shows plural file count", () => {
    expect(formatStashLine(mockStash, 0)).toContain("2 files")
  })

  it("shows singular file count", () => {
    expect(formatStashLine(singleFileStash, 0)).toContain("1 file")
    expect(formatStashLine(singleFileStash, 0)).not.toContain("1 files")
  })

  it("includes tags in square brackets", () => {
    const line = formatStashLine(mockStash, 0)
    expect(line).toContain("[docs, planning]")
  })

  it("shows no tags suffix when tags array is empty", () => {
    const line = formatStashLine(singleFileStash, 0)
    // Should not contain tag brackets
    expect(line).not.toMatch(/\[docs/)
  })

  it("includes the formatted date", () => {
    const line = formatStashLine(mockStash, 0)
    // Should contain a date pattern
    expect(line).toMatch(/\d{4}-\d{2}-\d{2}/)
  })
})

// ─── formatSize ──────────────────────────────────────────────────────────────

describe("formatSize", () => {
  it("formats bytes in a human-readable unit", () => {
    const result1KB = formatSize(1024)
    expect(result1KB).toMatch(/kB|KB/i)
  })

  it("formats megabytes", () => {
    const result = formatSize(1024 * 1024)
    expect(result).toMatch(/MB/i)
  })

  it("formats small sizes", () => {
    const result = formatSize(100)
    expect(result).toMatch(/B/i)
  })

  it("handles zero bytes", () => {
    const result = formatSize(0)
    expect(result).toBeTruthy()
    expect(result).toMatch(/B/i)
  })
})

// ─── formatStashChoice ───────────────────────────────────────────────────────

describe("formatStashChoice", () => {
  it("includes index, message, and size", () => {
    const choice = formatStashChoice(mockStash, 0)
    expect(choice).toContain("[0]")
    expect(choice).toContain("planning docs")
    expect(choice).toContain("2 files")
  })

  it("includes tags if present", () => {
    const choice = formatStashChoice(mockStash, 0)
    expect(choice).toContain("[docs, planning]")
  })
})

// ─── formatStashDetails ──────────────────────────────────────────────────────

describe("formatStashDetails", () => {
  it("includes project name and stash id", () => {
    const details = formatStashDetails(mockStash, "my-app")
    expect(details).toContain("my-app/2026-03-12_01-05_k7x2")
  })

  it("includes the message", () => {
    const details = formatStashDetails(mockStash, "my-app")
    expect(details).toContain("planning docs")
  })

  it("includes all file names", () => {
    const details = formatStashDetails(mockStash, "my-app")
    expect(details).toContain("README.md")
    expect(details).toContain("notes.txt")
  })

  it("includes git branch", () => {
    const details = formatStashDetails(mockStash, "my-app")
    expect(details).toContain("main")
  })

  it("includes short commit hash (7 chars)", () => {
    const details = formatStashDetails(mockStash, "my-app")
    expect(details).toContain("abc1234")
    expect(details).not.toContain("abc1234567890") // full hash should not appear
  })

  it("includes tags when present", () => {
    const details = formatStashDetails(mockStash, "my-app")
    expect(details).toContain("docs, planning")
  })

  it("omits tags section when tags are empty", () => {
    const details = formatStashDetails(singleFileStash, "my-app")
    expect(details).not.toContain("Tags:")
  })
})

// ─── truncate ────────────────────────────────────────────────────────────────

describe("truncate", () => {
  it("returns the original string when shorter than maxLength", () => {
    expect(truncate("hello", 10)).toBe("hello")
  })

  it("returns the original string when equal to maxLength", () => {
    expect(truncate("hello", 5)).toBe("hello")
  })

  it("truncates and appends '...' when longer than maxLength", () => {
    const result = truncate("hello world", 8)
    expect(result).toBe("hello...")
    expect(result.length).toBe(8)
  })

  it("handles very short maxLength", () => {
    const result = truncate("hello world", 3)
    expect(result.length).toBe(3)
    expect(result).toBe("...")
  })

  it("handles empty string", () => {
    expect(truncate("", 10)).toBe("")
  })
})
