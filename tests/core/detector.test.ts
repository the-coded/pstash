/**
 * tests/core/detector.test.ts
 *
 * Unit tests for ProjectDetector.
 * Mocks `simple-git` to avoid needing a real git repo.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { ProjectDetector } from "../../src/core/detector.js"
import type { GlobalConfig } from "../../src/schemas.js"

// ---------------------------------------------------------------------------
// Mock simple-git
// ---------------------------------------------------------------------------

// We need to mock the simpleGit factory from simple-git
vi.mock("simple-git", () => {
  const mockGit = {
    checkIsRepo: vi.fn(),
    getRemotes: vi.fn(),
    revparse: vi.fn(),
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
    checkIsRepo: ReturnType<typeof vi.fn>
    getRemotes: ReturnType<typeof vi.fn>
    revparse: ReturnType<typeof vi.fn>
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeConfig(
  projects: Record<string, { aliases: string[]; remote?: string }> = {},
): GlobalConfig {
  return {
    version: "1.0.0",
    remote: "https://github.com/user/stash.git",
    localPath: "~/.pstash",
    autoSync: true,
    projects: Object.fromEntries(
      Object.entries(projects).map(([name, cfg]) => [
        name,
        { aliases: cfg.aliases, remote: cfg.remote },
      ]),
    ),
    defaults: {
      keepOnPop: false,
      compression: true,
      removeAfterSave: false,
    },
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("ProjectDetector", () => {
  let detector: ProjectDetector
  let originalCwd: () => string

  beforeEach(async () => {
    detector = new ProjectDetector()
    originalCwd = process.cwd
    vi.clearAllMocks()
  })

  afterEach(() => {
    process.cwd = originalCwd
  })

  // ─── detect() ────────────────────────────────────────────────────────────

  describe("detect()", () => {
    it("returns repo name from SSH origin remote (git@github.com:user/my-repo.git)", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "origin",
          refs: { fetch: "git@github.com:gabemule/my-repo.git", push: "" },
        },
      ])

      const result = await detector.detect()
      expect(result).toBe("my-repo")
    })

    it("returns repo name from HTTPS origin remote (https://github.com/user/my-repo.git)", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "origin",
          refs: { fetch: "https://github.com/gabemule/my-repo.git", push: "" },
        },
      ])

      const result = await detector.detect()
      expect(result).toBe("my-repo")
    })

    it("strips .git suffix from remote URL", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "origin",
          refs: { fetch: "https://gitlab.com/team/awesome-project.git", push: "" },
        },
      ])

      const result = await detector.detect()
      expect(result).toBe("awesome-project")
    })

    it("returns basename of cwd when not a git repo", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(false)
      // Override process.cwd to return a predictable path
      process.cwd = () => "/home/user/my-local-project"

      const result = await detector.detect()
      expect(result).toBe("my-local-project")
    })

    it("returns basename of cwd when no remotes are configured", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.getRemotes.mockResolvedValue([])
      process.cwd = () => "/Users/gab/projects/cool-tool"

      const result = await detector.detect()
      expect(result).toBe("cool-tool")
    })

    it("falls back to non-origin remote if origin not found", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "upstream",
          refs: { fetch: "https://github.com/org/upstream-repo.git", push: "" },
        },
      ])

      const result = await detector.detect()
      expect(result).toBe("upstream-repo")
    })

    it("returns basename of cwd when simpleGit throws", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockRejectedValue(new Error("git not found"))
      process.cwd = () => "/Users/gab/projects/fallback-project"

      const result = await detector.detect()
      expect(result).toBe("fallback-project")
    })
  })

  // ─── getCurrentBranch() ───────────────────────────────────────────────────

  describe("getCurrentBranch()", () => {
    it("returns branch name when in a git repo", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.revparse.mockResolvedValue("feature/awesome-feature\n")

      const result = await detector.getCurrentBranch()
      expect(result).toBe("feature/awesome-feature")
    })

    it("returns undefined when not in a git repo", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(false)

      const result = await detector.getCurrentBranch()
      expect(result).toBeUndefined()
    })

    it("returns undefined when revparse throws", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.revparse.mockRejectedValue(new Error("not a git repo"))

      const result = await detector.getCurrentBranch()
      expect(result).toBeUndefined()
    })
  })

  // ─── getCurrentCommit() ───────────────────────────────────────────────────

  describe("getCurrentCommit()", () => {
    it("returns commit hash when in a git repo", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.revparse.mockResolvedValue("abc123def456\n")

      const result = await detector.getCurrentCommit()
      expect(result).toBe("abc123def456")
    })

    it("returns undefined when not in a git repo", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(false)

      const result = await detector.getCurrentCommit()
      expect(result).toBeUndefined()
    })
  })

  // ─── resolveAlias() ───────────────────────────────────────────────────────

  describe("resolveAlias()", () => {
    it("returns the canonical project name when name is an alias", () => {
      const config = makeConfig({
        scena: { aliases: ["e2e-gen", "scena-cli"] },
        other: { aliases: ["alt-name"] },
      })

      expect(detector.resolveAlias("e2e-gen", config)).toBe("scena")
      expect(detector.resolveAlias("scena-cli", config)).toBe("scena")
      expect(detector.resolveAlias("alt-name", config)).toBe("other")
    })

    it("returns the name unchanged when no alias matches", () => {
      const config = makeConfig({
        scena: { aliases: ["e2e-gen"] },
      })

      expect(detector.resolveAlias("unknown-project", config)).toBe("unknown-project")
    })

    it("returns the name unchanged when no projects are configured", () => {
      const config = makeConfig()
      expect(detector.resolveAlias("my-project", config)).toBe("my-project")
    })

    it("returns the canonical name unchanged when passed directly (not an alias)", () => {
      const config = makeConfig({
        scena: { aliases: ["e2e-gen"] },
      })

      // "scena" is the canonical name — not listed as alias of another project
      expect(detector.resolveAlias("scena", config)).toBe("scena")
    })
  })

  // ─── detectAndResolve() ───────────────────────────────────────────────────

  describe("detectAndResolve()", () => {
    it("detects from git and resolves alias to canonical name", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "origin",
          refs: { fetch: "git@github.com:gabemule/e2e-gen.git", push: "" },
        },
      ])

      const config = makeConfig({
        scena: { aliases: ["e2e-gen", "scena-cli"] },
      })

      const result = await detector.detectAndResolve(config)
      expect(result).toBe("scena")
    })

    it("returns detected name unchanged when no alias matches", async () => {
      const mockGit = await getMockGit()
      mockGit.checkIsRepo.mockResolvedValue(true)
      mockGit.getRemotes.mockResolvedValue([
        {
          name: "origin",
          refs: { fetch: "git@github.com:gabemule/personal-blog.git", push: "" },
        },
      ])

      const config = makeConfig({
        scena: { aliases: ["e2e-gen"] },
      })

      const result = await detector.detectAndResolve(config)
      expect(result).toBe("personal-blog")
    })
  })
})
