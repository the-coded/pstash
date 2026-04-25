/**
 * @module tests/commands/status
 *
 * Tests for `pstash status` — repo health, unpushed count, project stats,
 * --all/--json modes, and uninitialized fallback.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const gitMocks = vi.hoisted(() => ({
  pull: vi.fn().mockResolvedValue(undefined),
  getUnpushedCount: vi.fn().mockResolvedValue(0),
  getLastSyncTime: vi.fn().mockResolvedValue(null),
}))

const stasherMocks = vi.hoisted(() => ({
  listProjects: vi.fn(),
  listMetadata: vi.fn(),
}))

const indexerMocks = vi.hoisted(() => ({
  load: vi.fn().mockResolvedValue(null),
}))

const detectorMocks = vi.hoisted(() => ({
  detectAndResolve: vi.fn().mockResolvedValue("my-project"),
}))

const loaderMocks = vi.hoisted(() => ({
  loadConfig: vi.fn(),
  resolveLocalPath: vi.fn().mockReturnValue("/fake/repo"),
}))

const fsMocks = vi.hoisted(() => ({
  exists: vi.fn().mockResolvedValue(true),
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
    getUnpushedCount = gitMocks.getUnpushedCount
    getLastSyncTime = gitMocks.getLastSyncTime
  },
}))

vi.mock("../../src/core/stasher.js", () => ({
  Stasher: class {
    listProjects = stasherMocks.listProjects
    listMetadata = stasherMocks.listMetadata
  },
}))

vi.mock("../../src/core/indexer.js", () => ({
  Indexer: class {
    load = indexerMocks.load
  },
}))

vi.mock("../../src/core/detector.js", () => ({
  ProjectDetector: class {
    detectAndResolve = detectorMocks.detectAndResolve
  },
}))

vi.mock("../../src/utils/fs.js", () => fsMocks)

vi.mock("../../src/utils/format.js", () => ({
  formatSize: vi.fn().mockReturnValue("100 B"),
}))

vi.mock("../../src/utils/time.js", () => ({
  timeAgo: vi.fn().mockReturnValue("2 hours ago"),
}))

// ─── Imports ──────────────────────────────────────────────────────────────────

import { statusCommand } from "../../src/commands/status.js"

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

const makeStash = (id: string) => ({
  id,
  project: "my-project",
  message: `stash ${id}`,
  timestamp: "2026-03-01T00:00:00.000Z",
  files: [{ name: "file.txt", size: 100, hash: "sha256:abc" }],
  tags: [],
  totalSize: 100,
  branch: "main",
  commit: "abc",
  compressed: false,
})

let logSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  vi.clearAllMocks()
  logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.loadConfig.mockResolvedValue(makeConfig())
  fsMocks.exists.mockResolvedValue(true)
  // Re-set implementations because clearAllMocks does NOT reset them
  detectorMocks.detectAndResolve.mockResolvedValue("my-project")
  stasherMocks.listProjects.mockResolvedValue(["my-project"])
  stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001"), makeStash("stash-002")])
  indexerMocks.load.mockResolvedValue({ updatedAt: "2026-03-01T00:00:00.000Z" })
  gitMocks.getUnpushedCount.mockResolvedValue(0)
  gitMocks.getLastSyncTime.mockResolvedValue(null)
})

// ─── Uninitialized repo ──────────────────────────────────────────────────────

describe("statusCommand — uninitialized", () => {
  it("warns when the local repo does not exist", async () => {
    fsMocks.exists.mockResolvedValue(false)

    await statusCommand({})

    const printed = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")
    expect(printed).toMatch(/not initialized/)
    expect(stasherMocks.listMetadata).not.toHaveBeenCalled()
  })
})

// ─── Default (current project) ───────────────────────────────────────────────

describe("statusCommand — default", () => {
  it("uses the detected project when --all is not set", async () => {
    await statusCommand({})

    expect(detectorMocks.detectAndResolve).toHaveBeenCalledOnce()
    expect(stasherMocks.listProjects).not.toHaveBeenCalled()
    expect(stasherMocks.listMetadata).toHaveBeenCalledWith("my-project")
  })

  it("falls back to an empty project list when detection fails", async () => {
    detectorMocks.detectAndResolve.mockRejectedValue(new Error("not in a repo"))

    await statusCommand({})

    const printed = logSpy.mock.calls.map((c: unknown[]) => String(c[0])).join("\n")
    expect(printed).toMatch(/No stashes yet/)
  })
})

// ─── --all ───────────────────────────────────────────────────────────────────

describe("statusCommand — --all", () => {
  it("lists every project from the stasher", async () => {
    stasherMocks.listProjects.mockResolvedValue(["proj-a", "proj-b"])

    await statusCommand({ all: true })

    expect(stasherMocks.listProjects).toHaveBeenCalledOnce()
    expect(detectorMocks.detectAndResolve).not.toHaveBeenCalled()
    expect(stasherMocks.listMetadata).toHaveBeenCalledWith("proj-a")
    expect(stasherMocks.listMetadata).toHaveBeenCalledWith("proj-b")
  })
})

// ─── --json ──────────────────────────────────────────────────────────────────

describe("statusCommand — --json", () => {
  it("prints a JSON payload with remote, repo path, projects, and unpushed count", async () => {
    gitMocks.getUnpushedCount.mockResolvedValue(3)

    await statusCommand({ json: true })

    // The single JSON.stringify call lives in the last logSpy call; pick it directly
    const lastCall = logSpy.mock.calls.at(-1) as unknown[] | undefined
    const printed = String(lastCall?.[0])
    const parsed = JSON.parse(printed) as {
      remote: string
      localPath: string
      initialized: boolean
      unpushedCount: number
      projects: Array<{ name: string; stashCount: number }>
    }
    expect(parsed.remote).toBe("git@github.com:user/stash.git")
    expect(parsed.initialized).toBe(true)
    expect(parsed.unpushedCount).toBe(3)
    expect(parsed.projects).toHaveLength(1)
    expect(parsed.projects[0]?.name).toBe("my-project")
    expect(parsed.projects[0]?.stashCount).toBe(2)
  })
})

// ─── autoSync ────────────────────────────────────────────────────────────────

describe("statusCommand — autoSync", () => {
  it("pulls when autoSync=true and the repo exists", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await statusCommand({})

    expect(gitMocks.pull).toHaveBeenCalledOnce()
  })

  it("does not pull when autoSync=true but the repo is missing", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))
    fsMocks.exists.mockResolvedValue(false)

    await statusCommand({})

    expect(gitMocks.pull).not.toHaveBeenCalled()
  })

  it("does not pull when autoSync=false", async () => {
    await statusCommand({})

    expect(gitMocks.pull).not.toHaveBeenCalled()
  })
})
