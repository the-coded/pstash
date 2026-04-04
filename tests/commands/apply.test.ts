/**
 * @module tests/commands/apply
 *
 * Tests for `pstash apply` — autoSync pull (no push), stash is preserved after restore.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const gitMocks = vi.hoisted(() => ({
  pull: vi.fn().mockResolvedValue(undefined),
  push: vi.fn().mockResolvedValue(undefined),
}))

const stasherMocks = vi.hoisted(() => ({
  listMetadata: vi.fn(),
  restore: vi.fn().mockResolvedValue(undefined),
  delete: vi.fn().mockResolvedValue(undefined),
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
  },
}))

vi.mock("../../src/core/stasher.js", () => ({
  Stasher: class {
    listMetadata = stasherMocks.listMetadata
    restore = stasherMocks.restore
    delete = stasherMocks.delete
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

import { applyCommand } from "../../src/commands/apply.js"

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

describe("applyCommand — autoSync", () => {
  it("pulls before applying when autoSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await applyCommand(0, {})

    expect(gitMocks.pull).toHaveBeenCalledOnce()
  })

  it("skips pull when autoSync=false", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await applyCommand(0, {})

    expect(gitMocks.pull).not.toHaveBeenCalled()
  })

  it("never pushes after apply (apply does not commit)", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await applyCommand(0, {})

    expect(gitMocks.push).not.toHaveBeenCalled()
  })
})

// ─── Stash is preserved ───────────────────────────────────────────────────────

describe("applyCommand — stash preservation", () => {
  it("does NOT delete the stash after restoring (unlike pop)", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await applyCommand(0, {})

    expect(stasherMocks.restore).toHaveBeenCalledOnce()
    expect(stasherMocks.delete).not.toHaveBeenCalled()
  })

  it("can be applied to a specific index without deleting it", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await applyCommand(1, {})

    expect(stasherMocks.restore).toHaveBeenCalledWith(
      expect.objectContaining({ stashId: "stash-002" }),
    )
    expect(stasherMocks.delete).not.toHaveBeenCalled()
  })
})

// ─── Stash selection by index ─────────────────────────────────────────────────

describe("applyCommand — index selection", () => {
  it("throws when the index is out of range", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001")])

    await expect(applyCommand(5, {})).rejects.toThrow("out of range")
  })

  it("returns early when no stashes exist", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listMetadata.mockResolvedValue([])

    await applyCommand(0, {})

    expect(stasherMocks.restore).not.toHaveBeenCalled()
  })
})

// ─── Restore options ──────────────────────────────────────────────────────────

describe("applyCommand — restore options", () => {
  it("passes dest option to stasher.restore", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await applyCommand(0, { dest: "/tmp/output" })

    expect(stasherMocks.restore).toHaveBeenCalledWith(
      expect.objectContaining({ dest: "/tmp/output" }),
    )
  })

  it("passes filesPattern when --files is set", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await applyCommand(0, { files: "*.ts" })

    expect(stasherMocks.restore).toHaveBeenCalledWith(
      expect.objectContaining({ filesPattern: "*.ts" }),
    )
  })

  it("propagates errors from stasher.restore", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.restore.mockRejectedValueOnce(new Error("Restore failed"))

    await expect(applyCommand(0, {})).rejects.toThrow("Restore failed")
  })
})
