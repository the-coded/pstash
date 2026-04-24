/**
 * tests/core/git.test.ts
 *
 * Unit tests for GitManager.
 * Mocks `simple-git` to avoid real git operations.
 */

import { describe, it, expect, vi, beforeEach } from "vitest"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { GitManager } from "../../src/core/git.js"

// ---------------------------------------------------------------------------
// Mock simple-git
// ---------------------------------------------------------------------------

vi.mock("simple-git", () => {
  const mockGit = {
    clone: vi.fn(),
    init: vi.fn(),
    addRemote: vi.fn(),
    addConfig: vi.fn(),
    add: vi.fn(),
    commit: vi.fn(),
    status: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    log: vi.fn(),
    rm: vi.fn(),
  }
  return {
    simpleGit: vi.fn(() => mockGit),
    __mockGit: mockGit,
  }
})

async function getMockGit() {
  const mod = await import("simple-git")
  // @ts-expect-error __mockGit is injected by the mock
  return mod.__mockGit as {
    clone: ReturnType<typeof vi.fn>
    init: ReturnType<typeof vi.fn>
    addRemote: ReturnType<typeof vi.fn>
    addConfig: ReturnType<typeof vi.fn>
    add: ReturnType<typeof vi.fn>
    commit: ReturnType<typeof vi.fn>
    status: ReturnType<typeof vi.fn>
    push: ReturnType<typeof vi.fn>
    pull: ReturnType<typeof vi.fn>
    log: ReturnType<typeof vi.fn>
    rm: ReturnType<typeof vi.fn>
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("GitManager", () => {
  let repoDir: string
  let manager: GitManager

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "pstash-git-"))
    manager = new GitManager(repoDir)
    vi.clearAllMocks()
  })

  // ─── clone() ─────────────────────────────────────────────────────────────

  describe("clone()", () => {
    it("calls git.clone with the remote URL and target path", async () => {
      const mockGit = await getMockGit()
      mockGit.clone.mockResolvedValue(undefined)

      await manager.clone("git@github.com:user/stash.git", "/tmp/my-stash")

      expect(mockGit.clone).toHaveBeenCalledWith("git@github.com:user/stash.git", "/tmp/my-stash")
    })

    it("propagates errors from git.clone", async () => {
      const mockGit = await getMockGit()
      mockGit.clone.mockRejectedValue(new Error("Repository not found"))

      await expect(
        manager.clone("git@github.com:user/nonexistent.git", "/tmp/dest"),
      ).rejects.toThrow("Repository not found")
    })
  })

  // ─── commitAll() ─────────────────────────────────────────────────────────

  describe("commitAll()", () => {
    it("stages all files and commits when there are changes", async () => {
      const mockGit = await getMockGit()
      mockGit.add.mockResolvedValue(undefined)
      mockGit.status.mockResolvedValue({ files: [{ path: "some-file.txt" }] })
      mockGit.commit.mockResolvedValue({ commit: "abc123" })

      await manager.commitAll("feat: add stash")

      expect(mockGit.add).toHaveBeenCalledWith("-A")
      expect(mockGit.commit).toHaveBeenCalledWith("feat: add stash")
    })

    it("skips commit when there are no staged changes", async () => {
      const mockGit = await getMockGit()
      mockGit.add.mockResolvedValue(undefined)
      mockGit.status.mockResolvedValue({ files: [] })

      await manager.commitAll("feat: empty commit")

      expect(mockGit.add).toHaveBeenCalledWith("-A")
      expect(mockGit.commit).not.toHaveBeenCalled()
    })
  })

  // ─── push() ──────────────────────────────────────────────────────────────

  describe("push()", () => {
    it("pushes to origin HEAD on first try", async () => {
      const mockGit = await getMockGit()
      mockGit.push.mockResolvedValue(undefined)

      await manager.push()

      expect(mockGit.push).toHaveBeenCalledWith("origin", "HEAD")
    })

    it("retries with --set-upstream when initial push fails", async () => {
      const mockGit = await getMockGit()
      // First call fails (no upstream set), second call succeeds
      mockGit.push
        .mockRejectedValueOnce(new Error("no upstream branch"))
        .mockResolvedValueOnce(undefined)

      await manager.push()

      expect(mockGit.push).toHaveBeenCalledTimes(2)
      expect(mockGit.push).toHaveBeenLastCalledWith(["--set-upstream", "origin", "HEAD"])
    })

    it("propagates error if both push attempts fail", async () => {
      const mockGit = await getMockGit()
      mockGit.push
        .mockRejectedValueOnce(new Error("no upstream"))
        .mockRejectedValueOnce(new Error("auth failed"))

      await expect(manager.push()).rejects.toThrow("auth failed")
    })
  })

  // ─── pull() ──────────────────────────────────────────────────────────────

  describe("pull()", () => {
    it("pulls from origin with rebase flag", async () => {
      const mockGit = await getMockGit()
      mockGit.pull.mockResolvedValue({ summary: { changes: 0 } })

      await manager.pull()

      expect(mockGit.pull).toHaveBeenCalledWith("origin", undefined, {
        "--rebase": null,
      })
    })

    it("propagates errors from git.pull", async () => {
      const mockGit = await getMockGit()
      mockGit.pull.mockRejectedValue(new Error("network error"))

      await expect(manager.pull()).rejects.toThrow("network error")
    })
  })

  // ─── sync() ──────────────────────────────────────────────────────────────

  describe("sync()", () => {
    it("calls pull then push in order", async () => {
      const mockGit = await getMockGit()
      const callOrder: string[] = []

      mockGit.pull.mockImplementation(async () => {
        callOrder.push("pull")
      })
      mockGit.push.mockImplementation(async () => {
        callOrder.push("push")
      })

      await manager.sync()

      expect(callOrder).toEqual(["pull", "push"])
    })

    it("propagates pull errors before push is called", async () => {
      const mockGit = await getMockGit()
      mockGit.pull.mockRejectedValue(new Error("pull failed"))

      await expect(manager.sync()).rejects.toThrow("pull failed")
      expect(mockGit.push).not.toHaveBeenCalled()
    })
  })

  // ─── getUnpushedCount() ───────────────────────────────────────────────────

  describe("getUnpushedCount()", () => {
    it("returns the number of unpushed commits", async () => {
      const mockGit = await getMockGit()
      mockGit.log.mockResolvedValue({ total: 3, all: [], latest: null })

      const count = await manager.getUnpushedCount()
      expect(count).toBe(3)

      expect(mockGit.log).toHaveBeenCalledWith(["origin/HEAD..HEAD"])
    })

    it("returns 0 when all commits are pushed", async () => {
      const mockGit = await getMockGit()
      mockGit.log.mockResolvedValue({ total: 0, all: [], latest: null })

      const count = await manager.getUnpushedCount()
      expect(count).toBe(0)
    })

    it("returns 0 when git.log throws (no remote yet)", async () => {
      const mockGit = await getMockGit()
      mockGit.log.mockRejectedValue(new Error("unknown revision"))

      const count = await manager.getUnpushedCount()
      expect(count).toBe(0)
    })
  })

  // ─── getLastSyncTime() ────────────────────────────────────────────────────

  describe("getLastSyncTime()", () => {
    it("returns the date of the latest remote commit", async () => {
      const mockGit = await getMockGit()
      mockGit.log.mockResolvedValue({
        total: 1,
        latest: { date: "2026-03-12T01:05:00.000Z" },
      })

      const time = await manager.getLastSyncTime()
      expect(time).toBe("2026-03-12T01:05:00.000Z")
    })

    it("returns null when there are no remote commits", async () => {
      const mockGit = await getMockGit()
      mockGit.log.mockResolvedValue({ total: 0, latest: null })

      const time = await manager.getLastSyncTime()
      expect(time).toBeNull()
    })

    it("returns null when git.log throws", async () => {
      const mockGit = await getMockGit()
      mockGit.log.mockRejectedValue(new Error("no remote"))

      const time = await manager.getLastSyncTime()
      expect(time).toBeNull()
    })
  })

  // ─── removeAndCommit() ────────────────────────────────────────────────────

  describe("removeAndCommit()", () => {
    it("calls git.rm with recursive flag and then commits", async () => {
      const mockGit = await getMockGit()
      mockGit.rm.mockResolvedValue(undefined)
      mockGit.commit.mockResolvedValue({ commit: "def456" })

      await manager.removeAndCommit("my-project/2026-01-15_10-00_abcd", "drop: remove stash")

      expect(mockGit.rm).toHaveBeenCalledWith(["-r", "my-project/2026-01-15_10-00_abcd"])
      expect(mockGit.commit).toHaveBeenCalledWith("drop: remove stash")
    })

    it("propagates errors from git.rm", async () => {
      const mockGit = await getMockGit()
      mockGit.rm.mockRejectedValue(new Error("path not found"))

      await expect(manager.removeAndCommit("nonexistent/path", "drop: remove")).rejects.toThrow(
        "path not found",
      )
    })
  })
})
