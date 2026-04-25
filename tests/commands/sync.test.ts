/**
 * @module tests/commands/sync
 *
 * Tests for `pstash sync` — manual pull/push behavior.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"

// ─── Hoisted mocks ────────────────────────────────────────────────────────────

const gitMocks = vi.hoisted(() => ({
  pull: vi.fn().mockResolvedValue(undefined),
  push: vi.fn().mockResolvedValue(undefined),
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

// ─── Imports ──────────────────────────────────────────────────────────────────

import { syncCommand } from "../../src/commands/sync.js"

const baseConfig = {
  version: "1.0.0",
  remote: "git@github.com:user/stash.git",
  localPath: "~/.pstash",
  autoSync: true,
  projects: {},
  defaults: { keepOnPop: false, compression: false, removeAfterSave: false },
}

beforeEach(() => {
  vi.clearAllMocks()
  loaderMocks.loadConfig.mockResolvedValue(baseConfig)
  gitMocks.pull.mockResolvedValue(undefined)
  gitMocks.push.mockResolvedValue(undefined)
})

describe("syncCommand", () => {
  it("performs both pull and push by default", async () => {
    await syncCommand({})

    expect(gitMocks.pull).toHaveBeenCalledOnce()
    expect(gitMocks.push).toHaveBeenCalledOnce()
  })

  it("only pulls when --pull is set", async () => {
    await syncCommand({ pull: true })

    expect(gitMocks.pull).toHaveBeenCalledOnce()
    expect(gitMocks.push).not.toHaveBeenCalled()
  })

  it("only pushes when --push is set", async () => {
    await syncCommand({ push: true })

    expect(gitMocks.pull).not.toHaveBeenCalled()
    expect(gitMocks.push).toHaveBeenCalledOnce()
  })

  it("rethrows when pull fails", async () => {
    gitMocks.pull.mockRejectedValue(new Error("network down"))

    await expect(syncCommand({ pull: true })).rejects.toThrow("network down")
    expect(gitMocks.push).not.toHaveBeenCalled()
  })

  it("rethrows when push fails", async () => {
    gitMocks.push.mockRejectedValue(new Error("auth failed"))

    await expect(syncCommand({ push: true })).rejects.toThrow("auth failed")
  })

  it("aborts the push when an earlier pull fails", async () => {
    gitMocks.pull.mockRejectedValue(new Error("merge conflict"))

    await expect(syncCommand({})).rejects.toThrow("merge conflict")
    expect(gitMocks.push).not.toHaveBeenCalled()
  })
})
