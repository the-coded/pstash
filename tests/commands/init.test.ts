/**
 * @module tests/commands/init
 *
 * Tests for `pstash init` — config setup, clone vs init flow, and idempotency.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const gitMocks = vi.hoisted(() => ({
  clone: vi.fn().mockResolvedValue(undefined),
  initNewRepo: vi.fn().mockResolvedValue(undefined),
  configureLineEndings: vi.fn().mockResolvedValue(undefined),
}))

const loaderMocks = vi.hoisted(() => ({
  configExists: vi.fn().mockResolvedValue(false),
  saveConfig: vi.fn().mockResolvedValue(undefined),
  resolveLocalPath: vi.fn().mockReturnValue("/fake/repo"),
}))

const fsMocks = vi.hoisted(() => ({
  exists: vi.fn().mockResolvedValue(false),
}))

const inputMock = vi.hoisted(() => vi.fn())

const templatesMocks = vi.hoisted(() => ({
  createDefaultConfig: vi.fn(),
}))

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("ora", () => ({
  default: vi.fn().mockReturnValue({
    start: vi.fn().mockReturnValue({ succeed: vi.fn(), fail: vi.fn(), warn: vi.fn() }),
  }),
}))

vi.mock("@inquirer/prompts", () => ({
  input: inputMock,
}))

vi.mock("../../src/config/loader.js", () => loaderMocks)

vi.mock("../../src/config/templates.js", () => templatesMocks)

vi.mock("../../src/core/git.js", () => ({
  GitManager: class {
    clone = gitMocks.clone
    initNewRepo = gitMocks.initNewRepo
    configureLineEndings = gitMocks.configureLineEndings
  },
}))

vi.mock("../../src/utils/fs.js", () => fsMocks)

// ─── Imports ──────────────────────────────────────────────────────────────────

import { initCommand } from "../../src/commands/init.js"

beforeEach(() => {
  vi.clearAllMocks()
  vi.spyOn(console, "log").mockImplementation(() => undefined)
  loaderMocks.configExists.mockResolvedValue(false)
  fsMocks.exists.mockResolvedValue(false)
  templatesMocks.createDefaultConfig.mockReturnValue({
    version: "1.0.0",
    remote: "git@github.com:user/stash.git",
    localPath: "~/.pstash",
    autoSync: true,
    projects: {},
    defaults: { keepOnPop: false, compression: false, removeAfterSave: false },
  })
})

// ─── Idempotency ─────────────────────────────────────────────────────────────

describe("initCommand — idempotency", () => {
  it("returns early when ~/.pstashrc already exists", async () => {
    loaderMocks.configExists.mockResolvedValue(true)

    await initCommand({})

    expect(gitMocks.clone).not.toHaveBeenCalled()
    expect(gitMocks.initNewRepo).not.toHaveBeenCalled()
    expect(loaderMocks.saveConfig).not.toHaveBeenCalled()
  })
})

// ─── Remote URL handling ─────────────────────────────────────────────────────

describe("initCommand — remote URL", () => {
  it("uses --remote when provided (no prompt)", async () => {
    await initCommand({ remote: "git@github.com:user/stash.git" })

    expect(inputMock).not.toHaveBeenCalled()
    expect(templatesMocks.createDefaultConfig).toHaveBeenCalledWith(
      "git@github.com:user/stash.git",
      "~/.pstash",
    )
  })

  it("prompts for remote when not provided", async () => {
    inputMock.mockResolvedValue("git@github.com:user/stash.git")

    await initCommand({})

    expect(inputMock).toHaveBeenCalledOnce()
    expect(templatesMocks.createDefaultConfig).toHaveBeenCalledWith(
      "git@github.com:user/stash.git",
      "~/.pstash",
    )
  })
})

// ─── Path handling ───────────────────────────────────────────────────────────

describe("initCommand — local path", () => {
  it("uses --path when provided", async () => {
    await initCommand({ remote: "git@github.com:user/stash.git", path: "/custom/path" })

    expect(templatesMocks.createDefaultConfig).toHaveBeenCalledWith(
      "git@github.com:user/stash.git",
      "/custom/path",
    )
  })

  it("defaults to ~/.pstash when --path is not provided", async () => {
    await initCommand({ remote: "git@github.com:user/stash.git" })

    expect(templatesMocks.createDefaultConfig).toHaveBeenCalledWith(
      "git@github.com:user/stash.git",
      "~/.pstash",
    )
  })
})

// ─── Clone vs init ───────────────────────────────────────────────────────────

describe("initCommand — clone vs init", () => {
  it("clones when the local path does not exist", async () => {
    fsMocks.exists.mockResolvedValue(false)

    await initCommand({ remote: "git@github.com:user/stash.git" })

    expect(gitMocks.clone).toHaveBeenCalledWith("git@github.com:user/stash.git", "/fake/repo")
    expect(gitMocks.initNewRepo).not.toHaveBeenCalled()
  })

  it("skips cloning when the local path already exists", async () => {
    fsMocks.exists.mockResolvedValue(true)

    await initCommand({ remote: "git@github.com:user/stash.git" })

    expect(gitMocks.clone).not.toHaveBeenCalled()
    expect(gitMocks.initNewRepo).not.toHaveBeenCalled()
    expect(gitMocks.configureLineEndings).toHaveBeenCalledOnce()
  })

  it("falls back to initNewRepo when clone fails (e.g. empty remote)", async () => {
    fsMocks.exists.mockResolvedValue(false)
    gitMocks.clone.mockRejectedValueOnce(new Error("remote is empty"))

    await initCommand({ remote: "git@github.com:user/stash.git" })

    expect(gitMocks.clone).toHaveBeenCalledOnce()
    expect(gitMocks.initNewRepo).toHaveBeenCalledWith("/fake/repo", "git@github.com:user/stash.git")
  })

  it("rethrows when both clone and initNewRepo fail", async () => {
    fsMocks.exists.mockResolvedValue(false)
    gitMocks.clone.mockRejectedValueOnce(new Error("clone failed"))
    gitMocks.initNewRepo.mockRejectedValueOnce(new Error("init failed"))

    await expect(initCommand({ remote: "git@github.com:user/stash.git" })).rejects.toThrow(
      "init failed",
    )
    expect(loaderMocks.saveConfig).not.toHaveBeenCalled()
  })
})

// ─── Config save ─────────────────────────────────────────────────────────────

describe("initCommand — config save", () => {
  it("writes ~/.pstashrc after successful repo setup", async () => {
    await initCommand({ remote: "git@github.com:user/stash.git" })

    expect(loaderMocks.saveConfig).toHaveBeenCalledOnce()
  })
})
