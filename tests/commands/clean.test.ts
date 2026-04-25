/**
 * @module tests/commands/clean
 *
 * Tests for `pstash clean` — filter validation, --older-than/--keep/--tag
 * filters, --dry-run, --all, confirmation, and autoSync behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const gitMocks = vi.hoisted(() => ({
  pull: vi.fn().mockResolvedValue(undefined),
  push: vi.fn().mockResolvedValue(undefined),
  commitAll: vi.fn().mockResolvedValue(undefined),
}))

const stasherMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
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
    listProjects = stasherMocks.listProjects
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
  formatSize: vi.fn().mockReturnValue("100 B"),
}))

// ─── Imports ──────────────────────────────────────────────────────────────────

import { cleanCommand } from "../../src/commands/clean.js"

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

const makeStash = (id: string, overrides: Partial<{ tags: string[]; timestamp: string }> = {}) => ({
  id,
  project: "my-project",
  message: `stash ${id}`,
  timestamp: overrides.timestamp ?? "2026-03-01T00:00:00.000Z",
  files: [{ name: "file.txt", size: 100, hash: "sha256:abc" }],
  tags: overrides.tags ?? [],
  totalSize: 100,
  branch: "main",
  commit: "abc",
  compressed: false,
})

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.loadConfig.mockResolvedValue(makeConfig())
  promptsMocks.confirmAction.mockResolvedValue(true)
  stasherMocks.listProjects.mockResolvedValue(["my-project"])
})

// ─── Filter validation ───────────────────────────────────────────────────────

describe("cleanCommand — filter validation", () => {
  it("throws when no filter is provided", async () => {
    await expect(cleanCommand({})).rejects.toThrow("No filter specified")
    expect(stasherMocks.delete).not.toHaveBeenCalled()
  })
})

// ─── --tag filter ────────────────────────────────────────────────────────────

describe("cleanCommand — --tag filter", () => {
  it("removes only stashes with the given tag", async () => {
    stasherMocks.listMetadata.mockResolvedValue([
      makeStash("stash-001", { tags: ["wip"] }),
      makeStash("stash-002", { tags: ["release"] }),
      makeStash("stash-003", { tags: ["wip", "draft"] }),
    ])

    await cleanCommand({ tag: "wip", force: true })

    expect(stasherMocks.delete).toHaveBeenCalledTimes(2)
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-001")
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-003")
  })

  it("reports nothing to clean when no stash matches the tag", async () => {
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001", { tags: ["release"] })])

    await cleanCommand({ tag: "wip", force: true })

    expect(stasherMocks.delete).not.toHaveBeenCalled()
  })
})

// ─── --keep filter ───────────────────────────────────────────────────────────

describe("cleanCommand — --keep filter", () => {
  it("keeps only the N most recent stashes (newest-first list)", async () => {
    stasherMocks.listMetadata.mockResolvedValue([
      makeStash("stash-001"),
      makeStash("stash-002"),
      makeStash("stash-003"),
      makeStash("stash-004"),
    ])

    await cleanCommand({ keep: 2, force: true })

    expect(stasherMocks.delete).toHaveBeenCalledTimes(2)
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-003")
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-004")
  })

  it("does nothing when the project has fewer stashes than --keep", async () => {
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001"), makeStash("stash-002")])

    await cleanCommand({ keep: 5, force: true })

    expect(stasherMocks.delete).not.toHaveBeenCalled()
  })
})

// ─── --older-than filter ─────────────────────────────────────────────────────

describe("cleanCommand — --older-than filter", () => {
  it("removes stashes older than the cutoff", async () => {
    const oldDate = new Date(Date.now() - 1000 * 60 * 60 * 24 * 60).toISOString() // 60d ago
    const recentDate = new Date().toISOString()

    stasherMocks.listMetadata.mockResolvedValue([
      makeStash("stash-recent", { timestamp: recentDate }),
      makeStash("stash-old", { timestamp: oldDate }),
    ])

    await cleanCommand({ olderThan: "30d", force: true })

    expect(stasherMocks.delete).toHaveBeenCalledOnce()
    expect(stasherMocks.delete).toHaveBeenCalledWith("my-project", "stash-old")
  })
})

// ─── --dry-run ───────────────────────────────────────────────────────────────

describe("cleanCommand — --dry-run", () => {
  it("does not delete anything in dry-run", async () => {
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001", { tags: ["wip"] })])

    await cleanCommand({ tag: "wip", dryRun: true, force: true })

    expect(stasherMocks.delete).not.toHaveBeenCalled()
    expect(promptsMocks.confirmAction).not.toHaveBeenCalled()
    expect(gitMocks.commitAll).not.toHaveBeenCalled()
  })
})

// ─── --all ───────────────────────────────────────────────────────────────────

describe("cleanCommand — --all", () => {
  it("walks every project listed by the stasher", async () => {
    stasherMocks.listProjects.mockResolvedValue(["proj-a", "proj-b"])
    stasherMocks.listMetadata.mockImplementation(async (project: string) =>
      project === "proj-a"
        ? [makeStash("a-1", { tags: ["wip"] })]
        : [makeStash("b-1", { tags: ["wip"] })],
    )

    await cleanCommand({ tag: "wip", all: true, force: true })

    expect(stasherMocks.listProjects).toHaveBeenCalledOnce()
    expect(detectorMocks.detectAndResolve).not.toHaveBeenCalled()
    expect(stasherMocks.delete).toHaveBeenCalledTimes(2)
  })
})

// ─── Confirmation ────────────────────────────────────────────────────────────

describe("cleanCommand — confirmation", () => {
  it("asks for confirmation by default", async () => {
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001", { tags: ["wip"] })])

    await cleanCommand({ tag: "wip" })

    expect(promptsMocks.confirmAction).toHaveBeenCalledOnce()
    expect(stasherMocks.delete).toHaveBeenCalledOnce()
  })

  it("aborts without deleting when user declines", async () => {
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001", { tags: ["wip"] })])
    promptsMocks.confirmAction.mockResolvedValue(false)

    await cleanCommand({ tag: "wip" })

    expect(stasherMocks.delete).not.toHaveBeenCalled()
    expect(gitMocks.commitAll).not.toHaveBeenCalled()
  })

  it("skips confirmation when --force is set", async () => {
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001", { tags: ["wip"] })])

    await cleanCommand({ tag: "wip", force: true })

    expect(promptsMocks.confirmAction).not.toHaveBeenCalled()
  })
})

// ─── autoSync ────────────────────────────────────────────────────────────────

describe("cleanCommand — autoSync", () => {
  it("pulls before and pushes after when autoSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001", { tags: ["wip"] })])

    await cleanCommand({ tag: "wip", force: true })

    expect(gitMocks.pull).toHaveBeenCalledOnce()
    expect(gitMocks.push).toHaveBeenCalledOnce()
  })

  it("commits even when autoSync=false (push is skipped)", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001", { tags: ["wip"] })])

    await cleanCommand({ tag: "wip", force: true })

    expect(gitMocks.commitAll).toHaveBeenCalledOnce()
    expect(gitMocks.push).not.toHaveBeenCalled()
  })
})
