/**
 * @module tests/commands/save
 *
 * Tests for `pstash save` — autoSync pull/push behavior, file removal, compression.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mock state (accessible inside vi.mock factories) ─────────────────

const gitMocks = vi.hoisted(() => ({
  pull: vi.fn().mockResolvedValue(undefined),
  push: vi.fn().mockResolvedValue(undefined),
  commitAll: vi.fn().mockResolvedValue(undefined),
}))

const stasherMocks = vi.hoisted(() => ({
  save: vi.fn(),
}))

const indexerMocks = vi.hoisted(() => ({
  onSave: vi.fn().mockResolvedValue(undefined),
}))

const detectorMocks = vi.hoisted(() => ({
  detectAndResolve: vi.fn().mockResolvedValue("my-project"),
  getCurrentBranch: vi.fn().mockResolvedValue("main"),
  getCurrentCommit: vi.fn().mockResolvedValue("abc123"),
}))

const loaderMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  resolveLocalPath: vi.fn().mockReturnValue("/fake/repo"),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("ora", () => ({
  default: vi.fn().mockReturnValue({
    start: vi.fn().mockReturnValue({ succeed: vi.fn(), fail: vi.fn(), warn: vi.fn() }),
  }),
}))

vi.mock("../../src/config/loader.js", () => loaderMocks)

vi.mock("../../src/core/git.js", () => ({
  GitManager: class {
    pull = gitMocks.pull
    push = gitMocks.push
    commitAll = gitMocks.commitAll
  },
}))

vi.mock("../../src/core/stasher.js", () => ({
  Stasher: class {
    save = stasherMocks.save
  },
}))

vi.mock("../../src/core/indexer.js", () => ({
  Indexer: class {
    onSave = indexerMocks.onSave
  },
}))

vi.mock("../../src/core/detector.js", () => ({
  ProjectDetector: class {
    detectAndResolve = detectorMocks.detectAndResolve
    getCurrentBranch = detectorMocks.getCurrentBranch
    getCurrentCommit = detectorMocks.getCurrentCommit
  },
}))

vi.mock("globby", () => ({
  globby: vi.fn().mockResolvedValue([]),
}))

vi.mock("../../src/utils/fs.js", () => ({
  removeFiles: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("../../src/utils/format.js", () => ({
  formatStashLine: vi.fn().mockReturnValue("[stash line]"),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { globby } from "globby"
import { removeFiles } from "../../src/utils/fs.js"
import { saveCommand } from "../../src/commands/save.js"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  version: "1.0.0",
  remote: "git@github.com:user/stash.git",
  localPath: "~/.pstash",
  autoSync: true,
  projects: {},
  defaults: { keepOnPop: false, compression: true, removeAfterSave: false },
  ...overrides,
})

const mockMetadata = {
  id: "stash-001",
  message: "test stash",
  timestamp: "2026-01-01T00:00:00.000Z",
  files: [{ name: "file.txt", size: 100 }],
  tags: [],
  totalSize: 100,
  branch: "main",
  commit: "abc123",
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.resolveLocalPath.mockReturnValue("/fake/repo")
  stasherMocks.save.mockResolvedValue(mockMetadata)
})

// ─── autoSync behavior ────────────────────────────────────────────────────────

describe("saveCommand — autoSync", () => {
  it("pulls before and pushes after save when autoSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await saveCommand("test stash", ["*.md"], { tag: [] })

    expect(gitMocks.pull).toHaveBeenCalledOnce()
    expect(gitMocks.push).toHaveBeenCalledOnce()
  })

  it("skips pull and push when autoSync=false", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await saveCommand("test stash", ["*.md"], { tag: [] })

    expect(gitMocks.pull).not.toHaveBeenCalled()
    expect(gitMocks.push).not.toHaveBeenCalled()
  })

  it("skips pull and push when noSync=true even if autoSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await saveCommand("test stash", ["*.md"], { tag: [], noSync: true })

    expect(gitMocks.pull).not.toHaveBeenCalled()
    expect(gitMocks.push).not.toHaveBeenCalled()
  })

  it("always commits regardless of autoSync", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await saveCommand("test stash", ["*.md"], { tag: [] })

    expect(gitMocks.commitAll).toHaveBeenCalledOnce()
    expect(gitMocks.commitAll).toHaveBeenCalledWith("stash(my-project): test stash")
  })
})

// ─── File removal ─────────────────────────────────────────────────────────────

describe("saveCommand — file removal", () => {
  it("does not remove files by default (removeAfterSave=false)", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await saveCommand("test stash", ["*.md"], { tag: [] })

    expect(removeFiles).not.toHaveBeenCalled()
  })

  it("removes files when --rm is passed", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    vi.mocked(globby).mockResolvedValue(["file.txt"] as never)

    await saveCommand("test stash", ["*.md"], { tag: [], rm: true })

    expect(removeFiles).toHaveBeenCalledWith(["file.txt"])
  })

  it("removes files when config removeAfterSave=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(
      makeConfig({ defaults: { keepOnPop: false, compression: true, removeAfterSave: true } }),
    )
    vi.mocked(globby).mockResolvedValue(["file.txt"] as never)

    await saveCommand("test stash", ["*.md"], { tag: [] })

    expect(removeFiles).toHaveBeenCalled()
  })

  it("keeps files when --keep is passed even if config removeAfterSave=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(
      makeConfig({ defaults: { keepOnPop: false, compression: true, removeAfterSave: true } }),
    )

    await saveCommand("test stash", ["*.md"], { tag: [], keep: true })

    expect(removeFiles).not.toHaveBeenCalled()
  })
})

// ─── Compression ─────────────────────────────────────────────────────────────

describe("saveCommand — compression", () => {
  it("passes compress=true when config compression=true and no flag override", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await saveCommand("test stash", ["*.md"], { tag: [] })

    expect(stasherMocks.save).toHaveBeenCalledWith(expect.objectContaining({ compress: true }))
  })

  it("passes compress=false when noCompress=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await saveCommand("test stash", ["*.md"], { tag: [], noCompress: true })

    expect(stasherMocks.save).toHaveBeenCalledWith(expect.objectContaining({ compress: false }))
  })

  it("passes compress=false when config compression=false", async () => {
    loaderMocks.loadConfig.mockResolvedValue(
      makeConfig({ defaults: { keepOnPop: false, compression: false, removeAfterSave: false } }),
    )

    await saveCommand("test stash", ["*.md"], { tag: [] })

    expect(stasherMocks.save).toHaveBeenCalledWith(expect.objectContaining({ compress: false }))
  })
})

// ─── Stash content ────────────────────────────────────────────────────────────

describe("saveCommand — stash content", () => {
  it("passes message and tags to stasher.save", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await saveCommand("my docs", ["*.md"], { tag: ["docs", "wip"], project: "custom-proj" })

    expect(stasherMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ project: "custom-proj", message: "my docs", tags: ["docs", "wip"] }),
    )
  })

  it("uses detected project name when --project is not passed", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await saveCommand("test stash", [], { tag: [] })

    expect(stasherMocks.save).toHaveBeenCalledWith(
      expect.objectContaining({ project: "my-project" }),
    )
  })
})
