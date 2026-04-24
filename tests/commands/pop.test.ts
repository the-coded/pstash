/**
 * @module tests/commands/pop
 *
 * Tests for `pstash pop` — autoSync pull/push, stash deletion, index range.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const gitMocks = vi.hoisted(() => ({
  pull: vi.fn().mockResolvedValue(undefined),
  push: vi.fn().mockResolvedValue(undefined),
  commitAll: vi.fn().mockResolvedValue(undefined),
}))

const stasherMocks = vi.hoisted(() => ({
  listMetadata: vi.fn(),
  restore: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
}))

const indexerMocks = vi.hoisted(() => ({
  onDelete: vi.fn().mockResolvedValue(undefined),
}))

const detectorMocks = vi.hoisted(() => ({
  detectAndResolve: vi.fn().mockResolvedValue("my-project"),
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
    listMetadata = stasherMocks.listMetadata
    restore = stasherMocks.restore
    delete = stasherMocks.delete
  },
}))

vi.mock("../../src/core/indexer.js", () => ({
  Indexer: class {
    onDelete = indexerMocks.onDelete
  },
}))

vi.mock("../../src/core/detector.js", () => ({
  ProjectDetector: class {
    detectAndResolve = detectorMocks.detectAndResolve
  },
}))

vi.mock("../../src/utils/prompts.js", () => ({
  selectStash: vi.fn(),
}))

vi.mock("../../src/utils/format.js", () => ({
  formatStashDetails: vi.fn().mockReturnValue("[stash details]"),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { popCommand } from "../../src/commands/pop.js"

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

const makeStash = (id: string) => ({
  id,
  message: `stash ${id}`,
  timestamp: "2026-03-01T00:00:00.000Z",
  files: [{ name: "file.txt", size: 100 }],
  tags: [],
  totalSize: 100,
  branch: "main",
  commit: "abc123",
})

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.resolveLocalPath.mockReturnValue("/fake/repo")
  stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001"), makeStash("stash-002")])
})

// ─── autoSync behavior ────────────────────────────────────────────────────────

describe("popCommand — autoSync", () => {
  it("pulls before and pushes after pop when autoSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await popCommand(0, {})

    expect(gitMocks.pull).toHaveBeenCalledOnce()
    expect(gitMocks.push).toHaveBeenCalledOnce()
  })

  it("skips pull and push when autoSync=false", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await popCommand(0, {})

    expect(gitMocks.pull).not.toHaveBeenCalled()
    expect(gitMocks.push).not.toHaveBeenCalled()
  })

  it("always commits the deletion regardless of autoSync", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await popCommand(0, {})

    expect(gitMocks.commitAll).toHaveBeenCalledOnce()
    expect(gitMocks.commitAll).toHaveBeenCalledWith("drop(my-project): stash stash-001")
  })
})

// ─── Stash selection by index ─────────────────────────────────────────────────

describe("popCommand — index selection", () => {
  it("restores and deletes the stash at the given index", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await popCommand(1, {})

    expect(stasherMocks.restore).toHaveBeenCalledWith(
      expect.objectContaining({ stashId: "stash-002" }),
    )
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-002")
  })

  it("throws when the index is out of range", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001")])

    await expect(popCommand(5, {})).rejects.toThrow("out of range")
  })

  it("returns early when no stashes exist", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listMetadata.mockResolvedValue([])

    await popCommand(0, {})

    expect(stasherMocks.restore).not.toHaveBeenCalled()
    expect(stasherMocks.delete).not.toHaveBeenCalled()
  })
})

// ─── Restore options ──────────────────────────────────────────────────────────

describe("popCommand — restore options", () => {
  it("passes dest option to stasher.restore", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await popCommand(0, { dest: "/tmp/output" })

    expect(stasherMocks.restore).toHaveBeenCalledWith(
      expect.objectContaining({ dest: "/tmp/output" }),
    )
  })

  it("passes filesPattern when --files is set", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await popCommand(0, { files: "*.md" })

    expect(stasherMocks.restore).toHaveBeenCalledWith(
      expect.objectContaining({ filesPattern: "*.md" }),
    )
  })

  it("passes force=true when --force is set", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await popCommand(0, { force: true })

    expect(stasherMocks.restore).toHaveBeenCalledWith(expect.objectContaining({ force: true }))
  })
})

// ─── Stash deletion ───────────────────────────────────────────────────────────

describe("popCommand — stash deletion", () => {
  it("deletes the stash after successful restore", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await popCommand(0, {})

    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-001")
    expect(indexerMocks.onDelete).toHaveBeenCalledOnce()
  })

  it("does NOT delete the stash when restore fails", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.restore.mockRejectedValueOnce(new Error("Restore failed: file exists"))

    await expect(popCommand(0, {})).rejects.toThrow("Restore failed")

    expect(stasherMocks.delete).not.toHaveBeenCalled()
  })
})
