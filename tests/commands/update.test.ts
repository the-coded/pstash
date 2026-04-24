/**
 * @module tests/commands/update
 *
 * Tests for `pstash update` — stash selection, message/tags preservation,
 * autoSync, confirmation, and --unstaged handling.
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
  update: vi.fn(),
}))

const indexerMocks = vi.hoisted(() => ({
  onUpdate: vi.fn().mockResolvedValue(undefined),
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

const promptsMocks = vi.hoisted(() => ({
  selectStash: vi.fn(),
  promptFilePatterns: vi.fn(),
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
    update = stasherMocks.update
  },
}))

vi.mock("../../src/core/indexer.js", () => ({
  Indexer: class {
    onUpdate = indexerMocks.onUpdate
  },
}))

vi.mock("../../src/core/detector.js", () => ({
  ProjectDetector: class {
    detectAndResolve = detectorMocks.detectAndResolve
    getCurrentBranch = detectorMocks.getCurrentBranch
    getCurrentCommit = detectorMocks.getCurrentCommit
  },
}))

vi.mock("../../src/utils/prompts.js", () => promptsMocks)

vi.mock("../../src/utils/format.js", () => ({
  formatStashLine: vi.fn().mockReturnValue("[stash line]"),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { updateCommand } from "../../src/commands/update.js"

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const makeConfig = (overrides: Record<string, unknown> = {}) => ({
  version: "1.0.0",
  remote: "git@github.com:user/stash.git",
  localPath: "~/.pstash",
  autoSync: true,
  projects: {},
  defaults: { keepOnPop: false, compression: false, removeAfterSave: false },
  ...overrides,
})

const makeStash = (id: string, overrides: Record<string, unknown> = {}) => ({
  id,
  project: "my-project",
  message: `stash ${id}`,
  timestamp: "2026-03-01T00:00:00.000Z",
  files: [{ name: "file.txt", size: 100, hash: "sha256:abc" }],
  tags: ["existing"],
  totalSize: 100,
  branch: "main",
  commit: "abc123",
  compressed: false,
  ...overrides,
})

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.resolveLocalPath.mockReturnValue("/fake/repo")
  promptsMocks.confirmAction.mockResolvedValue(true)
  stasherMocks.listMetadata.mockResolvedValue([
    makeStash("stash-001"),
    makeStash("stash-002"),
    makeStash("stash-003"),
  ])
  stasherMocks.update.mockResolvedValue(
    makeStash("stash-001", { message: "updated", updatedAt: "2026-03-02T00:00:00.000Z" }),
  )
})

// ─── Index selection ─────────────────────────────────────────────────────────

describe("updateCommand — stash selection", () => {
  it("targets the stash at the given index", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await updateCommand(1, ["*.md"], { force: true, tag: [] })

    expect(stasherMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ project: "my-project", stashId: "stash-002" }),
    )
  })

  it("throws when the index is out of range", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await expect(updateCommand(99, ["*.md"], { force: true, tag: [] })).rejects.toThrow(
      "out of range",
    )
  })

  it("prompts for stash selection when no index is given", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    promptsMocks.selectStash.mockResolvedValue({ stash: makeStash("stash-003"), index: 2 })

    await updateCommand(undefined, ["*.md"], { force: true, tag: [] })

    expect(promptsMocks.selectStash).toHaveBeenCalledOnce()
    expect(stasherMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ stashId: "stash-003" }),
    )
  })

  it("returns early when the project has no stashes", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listMetadata.mockResolvedValue([])

    await updateCommand(undefined, ["*.md"], { force: true, tag: [] })

    expect(stasherMocks.update).not.toHaveBeenCalled()
  })
})

// ─── Files resolution ────────────────────────────────────────────────────────

describe("updateCommand — files resolution", () => {
  it("uses explicit file patterns when provided", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await updateCommand(0, ["docs/*.md"], { force: true, tag: [] })

    expect(promptsMocks.promptFilePatterns).not.toHaveBeenCalled()
    expect(stasherMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["docs/*.md"] }),
    )
  })

  it("prompts for files when [files...] is empty and --unstaged is not set", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))
    promptsMocks.promptFilePatterns.mockResolvedValue(["prompted/*.md"])

    await updateCommand(0, [], { force: true, tag: [] })

    expect(promptsMocks.promptFilePatterns).toHaveBeenCalledOnce()
    expect(stasherMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ files: ["prompted/*.md"] }),
    )
  })
})

// ─── Message and tags preservation ───────────────────────────────────────────

describe("updateCommand — message/tags preservation", () => {
  it("does not send a message override when -m is not used (stasher keeps existing)", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await updateCommand(0, ["*.md"], { force: true, tag: [] })

    const call = stasherMocks.update.mock.calls[0]?.[0] as { message?: string }
    expect(call.message).toBeUndefined()
  })

  it("passes a new message when -m is used", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await updateCommand(0, ["*.md"], { force: true, tag: [], message: "new msg" })

    expect(stasherMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ message: "new msg" }),
    )
  })

  it("does not send tags override when -t is not used (stasher keeps existing)", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await updateCommand(0, ["*.md"], { force: true, tag: [] })

    const call = stasherMocks.update.mock.calls[0]?.[0] as { tags?: string[] }
    expect(call.tags).toBeUndefined()
  })

  it("replaces tags when -t is used (one or more)", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await updateCommand(0, ["*.md"], { force: true, tag: ["v2", "docs"] })

    expect(stasherMocks.update).toHaveBeenCalledWith(
      expect.objectContaining({ tags: ["v2", "docs"] }),
    )
  })
})

// ─── autoSync ────────────────────────────────────────────────────────────────

describe("updateCommand — autoSync", () => {
  it("pulls before and pushes after when autoSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await updateCommand(0, ["*.md"], { force: true, tag: [] })

    expect(gitMocks.pull).toHaveBeenCalledOnce()
    expect(gitMocks.push).toHaveBeenCalledOnce()
  })

  it("skips pull/push when noSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await updateCommand(0, ["*.md"], { force: true, tag: [], noSync: true })

    expect(gitMocks.pull).not.toHaveBeenCalled()
    expect(gitMocks.push).not.toHaveBeenCalled()
  })

  it("always commits regardless of autoSync", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await updateCommand(0, ["*.md"], { force: true, tag: [] })

    expect(gitMocks.commitAll).toHaveBeenCalledWith("update(my-project): updated")
  })
})

// ─── Confirmation ────────────────────────────────────────────────────────────

describe("updateCommand — confirmation", () => {
  it("asks for confirmation by default", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await updateCommand(0, ["*.md"], { tag: [] })

    expect(promptsMocks.confirmAction).toHaveBeenCalledOnce()
    expect(stasherMocks.update).toHaveBeenCalledOnce()
  })

  it("skips confirmation when --force is set", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await updateCommand(0, ["*.md"], { force: true, tag: [] })

    expect(promptsMocks.confirmAction).not.toHaveBeenCalled()
  })

  it("aborts without calling update when user declines confirmation", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))
    promptsMocks.confirmAction.mockResolvedValue(false)

    await updateCommand(0, ["*.md"], { tag: [] })

    expect(stasherMocks.update).not.toHaveBeenCalled()
    expect(gitMocks.commitAll).not.toHaveBeenCalled()
  })
})

// ─── Compression ─────────────────────────────────────────────────────────────

describe("updateCommand — compression", () => {
  it("uses config defaults.compression when --compress is not passed", async () => {
    loaderMocks.loadConfig.mockResolvedValue(
      makeConfig({
        autoSync: false,
        defaults: { keepOnPop: false, compression: true, removeAfterSave: false },
      }),
    )

    await updateCommand(0, ["*.md"], { force: true, tag: [] })

    expect(stasherMocks.update).toHaveBeenCalledWith(expect.objectContaining({ compress: true }))
  })

  it("--compress overrides config defaults.compression=false", async () => {
    loaderMocks.loadConfig.mockResolvedValue(
      makeConfig({
        autoSync: false,
        defaults: { keepOnPop: false, compression: false, removeAfterSave: false },
      }),
    )

    await updateCommand(0, ["*.md"], { force: true, tag: [], compress: true })

    expect(stasherMocks.update).toHaveBeenCalledWith(expect.objectContaining({ compress: true }))
  })
})
