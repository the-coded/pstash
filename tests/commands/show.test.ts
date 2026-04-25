/**
 * @module tests/commands/show
 *
 * Tests for `pstash show` — selection, --json/--files/--cat output modes,
 * autoSync pull, and pattern filtering.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const gitMocks = vi.hoisted(() => ({
  pull: vi.fn().mockResolvedValue(undefined),
}))

const stasherMocks = vi.hoisted(() => ({
  listMetadata: vi.fn(),
}))

const detectorMocks = vi.hoisted(() => ({
  detectAndResolve: vi.fn().mockResolvedValue("my-project"),
}))

const loaderMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  resolveLocalPath: vi.fn().mockReturnValue("/fake/repo"),
}))

const promptsMocks = vi.hoisted(() => ({
  selectStash: vi.fn(),
}))

const fsMocks = vi.hoisted(() => ({
  exists: vi.fn().mockResolvedValue(true),
}))

const readFileMock = vi.hoisted(() => vi.fn().mockResolvedValue("line1\nline2"))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("ora", () => ({
  default: vi.fn().mockReturnValue({
    start: vi.fn().mockReturnValue({ succeed: vi.fn(), fail: vi.fn(), warn: vi.fn() }),
  }),
}))

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
}))

vi.mock("../../src/config/loader.js", () => loaderMocks)

vi.mock("../../src/core/git.js", () => ({
  GitManager: class {
    pull = gitMocks.pull
  },
}))

vi.mock("../../src/core/stasher.js", () => ({
  Stasher: class {
    listMetadata = stasherMocks.listMetadata
  },
}))

vi.mock("../../src/core/detector.js", () => ({
  ProjectDetector: class {
    detectAndResolve = detectorMocks.detectAndResolve
  },
}))

vi.mock("../../src/utils/prompts.js", () => promptsMocks)

vi.mock("../../src/utils/fs.js", () => fsMocks)

vi.mock("../../src/utils/format.js", () => ({
  formatSize: vi.fn().mockReturnValue("100 B"),
  formatStashDetails: vi.fn().mockReturnValue("[stash details]"),
}))

// ─── Imports ──────────────────────────────────────────────────────────────────

import { showCommand } from "../../src/commands/show.js"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  version: "1.0.0",
  remote: "git@github.com:user/stash.git",
  localPath: "~/.pstash",
  autoSync: false,
  projects: {},
  defaults: { keepOnPop: false, compression: false, removeAfterSave: false },
  ...overrides,
})

const makeStash = (id: string, files: string[] = ["README.md", "notes.txt"]) => ({
  id,
  project: "my-project",
  message: `stash ${id}`,
  timestamp: "2026-03-01T00:00:00.000Z",
  files: files.map(name => ({ name, size: 100, hash: "sha256:abc" })),
  tags: [],
  totalSize: 100 * files.length,
  branch: "main",
  commit: "abc",
  compressed: false,
})

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.loadConfig.mockResolvedValue(makeConfig())
  stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001"), makeStash("stash-002")])
  fsMocks.exists.mockResolvedValue(true)
  readFileMock.mockResolvedValue("hello\nworld")
})

// ─── Stash selection ─────────────────────────────────────────────────────────

describe("showCommand — selection", () => {
  it("selects by index when given", async () => {
    await showCommand(1, {})

    // formatStashDetails is called with the indexed stash
    const { formatStashDetails } = await import("../../src/utils/format.js")
    expect(formatStashDetails).toHaveBeenCalledWith(
      expect.objectContaining({ id: "stash-002" }),
      "my-project",
    )
  })

  it("throws when index is out of range", async () => {
    await expect(showCommand(99, {})).rejects.toThrow("out of range")
  })

  it("uses interactive selector when no index is given", async () => {
    promptsMocks.selectStash.mockResolvedValue({ stash: makeStash("stash-001"), index: 0 })

    await showCommand(undefined, {})

    expect(promptsMocks.selectStash).toHaveBeenCalledOnce()
  })

  it("prints a friendly message and returns when there are no stashes", async () => {
    stasherMocks.listMetadata.mockResolvedValue([])

    await showCommand(undefined, {})

    expect(promptsMocks.selectStash).not.toHaveBeenCalled()
    expect(logSpy).toHaveBeenCalledWith(expect.stringContaining("No stashes found"))
  })
})

// ─── Output modes ────────────────────────────────────────────────────────────

describe("showCommand — output modes", () => {
  it("--json prints the stash as JSON", async () => {
    await showCommand(0, { json: true })

    const printed = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")
    expect(printed).toContain('"id": "stash-001"')
  })

  it("--files prints only the file list (no metadata details)", async () => {
    const { formatStashDetails } = await import("../../src/utils/format.js")

    await showCommand(0, { files: true })

    expect(formatStashDetails).not.toHaveBeenCalled()
  })

  it("default mode prints metadata details", async () => {
    const { formatStashDetails } = await import("../../src/utils/format.js")

    await showCommand(0, {})

    expect(formatStashDetails).toHaveBeenCalledOnce()
  })
})

// ─── Cat ──────────────────────────────────────────────────────────────────────

describe("showCommand — --cat", () => {
  it("reads every file when --cat has no pattern", async () => {
    await showCommand(0, { cat: "" })

    expect(readFileMock).toHaveBeenCalledTimes(2) // 2 files in the stash
  })

  it("filters files by glob when --cat has a pattern", async () => {
    await showCommand(0, { cat: "*.md" })

    // Only README.md matches *.md, notes.txt is excluded
    expect(readFileMock).toHaveBeenCalledTimes(1)
  })

  it("warns and returns when no files match the cat pattern", async () => {
    await showCommand(0, { cat: "*.nope" })

    expect(readFileMock).not.toHaveBeenCalled()
    const printed = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")
    expect(printed).toMatch(/No files match pattern/)
  })

  it("prints a placeholder when a stashed file is missing on disk", async () => {
    fsMocks.exists.mockResolvedValue(false)

    await showCommand(0, { cat: "" })

    expect(readFileMock).not.toHaveBeenCalled()
    const printed = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")
    expect(printed).toContain("(file not found)")
  })
})

// ─── autoSync ─────────────────────────────────────────────────────────────────

describe("showCommand — autoSync", () => {
  it("pulls before showing when autoSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await showCommand(0, {})

    expect(gitMocks.pull).toHaveBeenCalledOnce()
  })

  it("does not pull when autoSync=false", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await showCommand(0, {})

    expect(gitMocks.pull).not.toHaveBeenCalled()
  })
})
