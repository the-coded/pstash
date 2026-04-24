/**
 * @module tests/commands/drop
 *
 * Tests for `pstash drop` — index deletion, tag filter, --all, --force,
 * --dry-run, and interactive multi-select.
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

const promptsMocks = vi.hoisted(() => ({
  selectStashes: vi.fn(),
  confirmAction: vi.fn().mockResolvedValue(true),
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

vi.mock("../../src/utils/prompts.js", () => promptsMocks)

vi.mock("../../src/utils/format.js", () => ({
  formatStashLine: vi.fn().mockReturnValue("[stash line]"),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { dropCommand } from "../../src/commands/drop.js"

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

const makeStash = (id: string, tags: string[] = []) => ({
  id,
  message: `stash ${id}`,
  timestamp: "2026-03-01T00:00:00.000Z",
  files: [{ name: "file.txt", size: 100 }],
  tags,
  totalSize: 100,
  branch: "main",
  commit: "abc123",
})

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.resolveLocalPath.mockReturnValue("/fake/repo")
  promptsMocks.confirmAction.mockResolvedValue(true)
  stasherMocks.listMetadata.mockResolvedValue([
    makeStash("stash-001", ["wip"]),
    makeStash("stash-002", ["docs"]),
    makeStash("stash-003", ["wip"]),
  ])
})

// ─── Index-based deletion ─────────────────────────────────────────────────────

describe("dropCommand — index selection", () => {
  it("drops the stash at the given index", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await dropCommand(1, { force: true })

    expect(stasherMocks.delete).toHaveBeenCalledOnce()
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-002")
  })

  it("throws when the index is out of range", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await expect(dropCommand(99, { force: true })).rejects.toThrow("out of range")
  })
})

// ─── Interactive multi-select ────────────────────────────────────────────────

describe("dropCommand — interactive multi-select", () => {
  it("drops all stashes returned by selectStashes", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    const picked = [makeStash("stash-001"), makeStash("stash-003")]
    promptsMocks.selectStashes.mockResolvedValue(picked)

    await dropCommand(undefined, { force: true })

    expect(promptsMocks.selectStashes).toHaveBeenCalledOnce()
    expect(stasherMocks.delete).toHaveBeenCalledTimes(2)
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-001")
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-003")
  })

  it("uses a plural commit message when multiple stashes are dropped", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    promptsMocks.selectStashes.mockResolvedValue([makeStash("stash-001"), makeStash("stash-002")])

    await dropCommand(undefined, { force: true })

    expect(gitMocks.commitAll).toHaveBeenCalledWith("drop(my-project): removed 2 stashes")
  })

  it("uses a singular commit message when only one stash is dropped", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    promptsMocks.selectStashes.mockResolvedValue([makeStash("stash-001")])

    await dropCommand(undefined, { force: true })

    expect(gitMocks.commitAll).toHaveBeenCalledWith("drop(my-project): stash stash-001")
  })
})

// ─── Tag filter ──────────────────────────────────────────────────────────────

describe("dropCommand — tag filter", () => {
  it("drops all stashes matching the tag", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await dropCommand(undefined, { tag: "wip", force: true })

    expect(stasherMocks.delete).toHaveBeenCalledTimes(2)
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-001")
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-003")
  })

  it("returns early when no stashes match the tag", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await dropCommand(undefined, { tag: "nonexistent", force: true })

    expect(stasherMocks.delete).not.toHaveBeenCalled()
  })
})

// ─── --all flag ──────────────────────────────────────────────────────────────

describe("dropCommand — --all", () => {
  it("drops every stash in the project", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await dropCommand(undefined, { all: true, force: true })

    expect(stasherMocks.delete).toHaveBeenCalledTimes(3)
  })
})

// ─── --dry-run ───────────────────────────────────────────────────────────────

describe("dropCommand — --dry-run", () => {
  it("does not delete anything on dry-run", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await dropCommand(0, { dryRun: true, force: true })

    expect(stasherMocks.delete).not.toHaveBeenCalled()
    expect(gitMocks.commitAll).not.toHaveBeenCalled()
  })
})

// ─── Empty repo ──────────────────────────────────────────────────────────────

describe("dropCommand — no stashes", () => {
  it("returns early when the project has no stashes", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listMetadata.mockResolvedValue([])

    await dropCommand(undefined, { force: true })

    expect(promptsMocks.selectStashes).not.toHaveBeenCalled()
    expect(stasherMocks.delete).not.toHaveBeenCalled()
  })
})
