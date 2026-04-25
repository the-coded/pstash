/**
 * @module tests/commands/list
 *
 * Tests for `pstash list` — autoSync pull behavior, --all, --tag filter, --json output.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const gitMocks = vi.hoisted(() => ({
  pull: vi.fn().mockResolvedValue(undefined),
}))

const stasherMocks = vi.hoisted(() => ({
  listMetadata: vi.fn(),
  listProjects: vi.fn(),
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
  },
}))

vi.mock("../../src/core/stasher.js", () => ({
  Stasher: class {
    listMetadata = stasherMocks.listMetadata
    listProjects = stasherMocks.listProjects
  },
}))

vi.mock("../../src/core/detector.js", () => ({
  ProjectDetector: class {
    detectAndResolve = detectorMocks.detectAndResolve
  },
}))

const readFileMock = vi.hoisted(() => vi.fn().mockResolvedValue(""))
const existsMock = vi.hoisted(() => vi.fn().mockResolvedValue(false))

vi.mock("node:fs/promises", () => ({
  readFile: readFileMock,
}))

vi.mock("../../src/utils/fs.js", () => ({
  exists: existsMock,
}))

vi.mock("../../src/utils/format.js", () => ({
  formatStashLine: vi.fn().mockImplementation((_s, i) => `[stash ${i}]`),
}))

vi.mock("../../src/utils/time.js", () => ({
  parseTimespec: vi.fn().mockReturnValue(new Date("2026-01-01")),
  isAfter: vi.fn().mockReturnValue(true),
  isBefore: vi.fn().mockReturnValue(true),
}))

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { listCommand } from "../../src/commands/list.js"
import { formatStashLine } from "../../src/utils/format.js"

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
  stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001")])
  stasherMocks.listProjects.mockResolvedValue(["project-a"])
})

// ─── autoSync behavior ────────────────────────────────────────────────────────

describe("listCommand — autoSync", () => {
  it("pulls before listing when autoSync=true", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: true }))

    await listCommand({})

    expect(gitMocks.pull).toHaveBeenCalledOnce()
  })

  it("skips pull when autoSync=false", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))

    await listCommand({})

    expect(gitMocks.pull).not.toHaveBeenCalled()
  })
})

// ─── --all flag ──────────────────────────────────────────────────────────────

describe("listCommand — --all", () => {
  it("calls listProjects() when --all is set", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listProjects.mockResolvedValue(["project-a", "project-b"])
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001")])

    await listCommand({ all: true })

    expect(stasherMocks.listProjects).toHaveBeenCalledOnce()
  })

  it("calls listMetadata for each project when --all is set", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listProjects.mockResolvedValue(["project-a", "project-b"])
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001")])

    await listCommand({ all: true })

    expect(stasherMocks.listMetadata).toHaveBeenCalledTimes(2)
    expect(stasherMocks.listMetadata).toHaveBeenCalledWith("project-a")
    expect(stasherMocks.listMetadata).toHaveBeenCalledWith("project-b")
  })

  it("uses detected project name when --all is not set", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await listCommand({})

    expect(stasherMocks.listMetadata).toHaveBeenCalledWith("my-project")
    expect(stasherMocks.listProjects).not.toHaveBeenCalled()
  })
})

// ─── --project filter ────────────────────────────────────────────────────────

describe("listCommand — --project", () => {
  it("lists stashes for the specified project", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())

    await listCommand({ project: "specific-project" })

    expect(stasherMocks.listMetadata).toHaveBeenCalledWith("specific-project")
    expect(stasherMocks.listProjects).not.toHaveBeenCalled()
  })
})

// ─── --tag filter ─────────────────────────────────────────────────────────────

describe("listCommand — --tag filter", () => {
  it("calls formatStashLine only for stashes matching the tag", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listMetadata.mockResolvedValue([
      makeStash("stash-001", ["docs"]),
      makeStash("stash-002", ["wip"]),
      makeStash("stash-003", ["docs", "wip"]),
    ])

    await listCommand({ tag: "docs" })

    // Only stash-001 and stash-003 match "docs" tag
    expect(vi.mocked(formatStashLine)).toHaveBeenCalledTimes(2)
  })

  it("shows empty message when no stashes match the tag", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001", ["docs"])])

    await listCommand({ tag: "nonexistent" })

    const calls = vi.mocked(console.log).mock.calls.map(c => String(c[0]))
    expect(calls.some(msg => msg.includes("No stashes"))).toBe(true)
  })
})

// ─── --json output ────────────────────────────────────────────────────────────

describe("listCommand — --json", () => {
  it("outputs stashes as JSON array", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig())
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001"), makeStash("stash-002")])

    await listCommand({ json: true })

    const jsonCall = vi.mocked(console.log).mock.calls[0]?.[0] as string
    const parsed = JSON.parse(jsonCall)
    expect(Array.isArray(parsed)).toBe(true)
    expect(parsed).toHaveLength(2)
    expect(parsed[0].id).toBe("stash-001")
  })
})

// ─── --preview ────────────────────────────────────────────────────────────────

describe("listCommand — --preview", () => {
  it("reads each stash file to print a preview snippet", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001")])
    existsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue("first line\nsecond line\nthird line")

    await listCommand({ preview: true })

    expect(readFileMock).toHaveBeenCalledOnce()
    const printed = vi
      .mocked(console.log)
      .mock.calls.map(c => String(c[0]))
      .join("\n")
    expect(printed).toContain("first line")
  })

  it("does not crash when a previewed file is missing on disk", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001")])
    existsMock.mockResolvedValue(false)

    await expect(listCommand({ preview: true })).resolves.not.toThrow()
    expect(readFileMock).not.toHaveBeenCalled()
  })

  it("truncates preview lines longer than 80 chars", async () => {
    loaderMocks.loadConfig.mockResolvedValue(makeConfig({ autoSync: false }))
    stasherMocks.listMetadata.mockResolvedValue([makeStash("stash-001")])
    existsMock.mockResolvedValue(true)
    readFileMock.mockResolvedValue("x".repeat(200))

    await listCommand({ preview: true })

    const printed = vi
      .mocked(console.log)
      .mock.calls.map(c => String(c[0]))
      .join("\n")
    expect(printed).toContain("...")
  })
})
