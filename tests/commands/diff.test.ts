/**
 * @module tests/commands/diff
 *
 * Tests for `pstash diff` — index-based mode and interactive target picker
 * (compare stash A against cwd or another stash).
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mock state ───────────────────────────────────────────────────────

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
  selectDiffTarget: vi.fn(),
}))

const fsMocks = vi.hoisted(() => ({
  exists: vi.fn().mockResolvedValue(false),
}))

const readFileMock = vi.hoisted(() => vi.fn())

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

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { diffCommand } from "../../src/commands/diff.js"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  version: "1.0.0",
  remote: "git@github.com:user/stash.git",
  localPath: "~/.pstash",
  autoSync: false,
  projects: {},
  defaults: { keepOnPop: false, compression: true, removeAfterSave: false },
  ...overrides,
})

const makeStash = (id: string, files: string[] = ["file.txt"]) => ({
  id,
  message: `stash ${id}`,
  timestamp: "2026-03-01T00:00:00.000Z",
  files: files.map(name => ({ name, size: 100 })),
  tags: [],
  totalSize: 100,
  branch: "main",
  commit: "abc123",
})

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.loadConfig.mockResolvedValue(makeConfig())
  loaderMocks.resolveLocalPath.mockReturnValue("/fake/repo")
  fsMocks.exists.mockResolvedValue(false)
  readFileMock.mockResolvedValue("")
  stasherMocks.listMetadata.mockResolvedValue([
    makeStash("stash-001"),
    makeStash("stash-002"),
    makeStash("stash-003"),
  ])
})

// ─── Index-based ──────────────────────────────────────────────────────────────

describe("diffCommand — index mode", () => {
  it("does not prompt when indexA is provided", async () => {
    await diffCommand(0, undefined, {})

    expect(promptsMocks.selectStash).not.toHaveBeenCalled()
    expect(promptsMocks.selectDiffTarget).not.toHaveBeenCalled()
  })

  it("throws when indexA is out of range", async () => {
    await expect(diffCommand(99, undefined, {})).rejects.toThrow("out of range")
  })

  it("throws when indexB is out of range", async () => {
    await expect(diffCommand(0, 99, {})).rejects.toThrow("out of range")
  })
})

// ─── Interactive target selection ─────────────────────────────────────────────

describe("diffCommand — interactive target picker", () => {
  it("prompts for stash A then asks which target (cwd or another stash)", async () => {
    promptsMocks.selectStash.mockResolvedValue({ stash: makeStash("stash-001"), index: 0 })
    promptsMocks.selectDiffTarget.mockResolvedValue(null) // picked "cwd"

    await diffCommand(undefined, undefined, {})

    expect(promptsMocks.selectStash).toHaveBeenCalledOnce()
    expect(promptsMocks.selectDiffTarget).toHaveBeenCalledOnce()

    // The target picker receives every stash except the one chosen for A.
    const otherStashes = promptsMocks.selectDiffTarget.mock.calls[0]?.[0] as Array<{ id: string }>
    expect(otherStashes.map(s => s.id)).toEqual(["stash-002", "stash-003"])
  })

  it("uses the picked stash when selectDiffTarget returns a stash", async () => {
    promptsMocks.selectStash.mockResolvedValue({ stash: makeStash("stash-001"), index: 0 })
    const targetStash = makeStash("stash-002")
    promptsMocks.selectDiffTarget.mockResolvedValue(targetStash)

    await diffCommand(undefined, undefined, {})

    expect(promptsMocks.selectDiffTarget).toHaveBeenCalledOnce()
  })

  it("skips the target picker when only one stash exists", async () => {
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001")])
    promptsMocks.selectStash.mockResolvedValue({ stash: makeStash("stash-001"), index: 0 })

    await diffCommand(undefined, undefined, {})

    expect(promptsMocks.selectStash).toHaveBeenCalledOnce()
    expect(promptsMocks.selectDiffTarget).not.toHaveBeenCalled()
  })
})

// ─── Empty repo ──────────────────────────────────────────────────────────────

describe("diffCommand — no stashes", () => {
  it("returns early when the project has no stashes", async () => {
    stasherMocks.listMetadata.mockResolvedValue([])

    await diffCommand(undefined, undefined, {})

    expect(promptsMocks.selectStash).not.toHaveBeenCalled()
    expect(promptsMocks.selectDiffTarget).not.toHaveBeenCalled()
  })
})

// ─── autoSync ────────────────────────────────────────────────────────────────

describe("diffCommand — autoSync", () => {
  it("pulls before diffing when autoSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await diffCommand(0, undefined, {})

    expect(gitMocks.pull).toHaveBeenCalledOnce()
  })
})

// ─── Stash-vs-stash diff ─────────────────────────────────────────────────────

describe("diffCommand — diff rendering", () => {
  it("renders an inline diff when comparing two stashes with different content", async () => {
    fsMocks.exists.mockResolvedValue(true)
    // Stash A reads "hello\nworld", Stash B reads "hello\nbarney"
    readFileMock.mockResolvedValueOnce("hello\nworld").mockResolvedValueOnce("hello\nbarney")

    await diffCommand(0, 1, {})

    const printed = vi
      .mocked(console.log)
      .mock.calls.map(c => String(c[0]))
      .join("\n")
    // The renderer outputs +/- prefixed lines for changed content
    expect(printed).toContain("- world")
    expect(printed).toContain("+ barney")
  })

  it("flags a file as added when only present in stash B", async () => {
    stasherMocks.listMetadata.mockResolvedValue([
      makeStash("stash-001", ["a.txt"]),
      makeStash("stash-002", ["a.txt", "b.txt"]),
    ])
    fsMocks.exists.mockResolvedValue(true)
    readFileMock.mockResolvedValue("same") // a.txt identical in both

    await diffCommand(0, 1, {})

    const printed = vi
      .mocked(console.log)
      .mock.calls.map(c => String(c[0]))
      .join("\n")
    expect(printed).toMatch(/b\.txt.*added/)
  })

  it("flags a file as removed when only present in stash A", async () => {
    stasherMocks.listMetadata.mockResolvedValue([
      makeStash("stash-001", ["a.txt", "b.txt"]),
      makeStash("stash-002", ["a.txt"]),
    ])
    fsMocks.exists.mockResolvedValue(true)
    readFileMock.mockResolvedValue("same")

    await diffCommand(0, 1, {})

    const printed = vi
      .mocked(console.log)
      .mock.calls.map(c => String(c[0]))
      .join("\n")
    expect(printed).toMatch(/b\.txt.*removed/)
  })

  it("returns 'no files match' when --files filter excludes everything", async () => {
    await diffCommand(0, 1, { files: "*.nope" })

    const printed = vi
      .mocked(console.log)
      .mock.calls.map(c => String(c[0]))
      .join("\n")
    expect(printed).toMatch(/No files match/)
  })
})
