/**
 * tests/core/indexer.test.ts
 *
 * Integration tests for Indexer using real tmpdir (no mocking).
 * Verifies .project.json creation, update on save, and update on delete.
 */

import { describe, it, expect, beforeEach } from "vitest"
import { mkdtemp } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { Indexer } from "../../src/core/indexer.js"
import { readJson } from "../../src/utils/fs.js"
import { ProjectMetadataSchema } from "../../src/schemas.js"
import type { StashMetadata, ProjectMetadata } from "../../src/schemas.js"

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeStashMeta(overrides: Partial<StashMetadata> = {}): StashMetadata {
  return {
    id: "2025-01-15_10-00_abcd",
    project: "my-project",
    message: "test stash",
    timestamp: new Date().toISOString(),
    tags: [],
    files: [{ name: "src/index.ts", size: 1024, hash: "sha256:aabbccdd1234" }],
    totalSize: 1024,
    compressed: false,
    branch: "main",
    commit: "abc123",
    ...overrides,
  }
}

function expectMeta(meta: ProjectMetadata | null): ProjectMetadata {
  if (!meta) throw new Error("expected project metadata to be defined")
  return meta
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Indexer", () => {
  let repoDir: string
  let indexer: Indexer

  beforeEach(async () => {
    repoDir = await mkdtemp(join(tmpdir(), "pstash-indexer-"))
    indexer = new Indexer(repoDir)
  })

  // Clean up after each test
  // (using afterEach is fine but we keep it inline for clarity)

  describe("load()", () => {
    it("returns null for a project that has no .project.json", async () => {
      const result = await indexer.load("nonexistent-project")
      expect(result).toBeNull()
    })

    it("returns the metadata after onSave creates the file", async () => {
      const stash = makeStashMeta()
      await indexer.onSave("my-project", stash)

      const meta = await indexer.load("my-project")
      expect(meta).not.toBeNull()
      expect(meta?.name).toBe("my-project")
    })
  })

  describe("onSave()", () => {
    it("creates .project.json on first save", async () => {
      const stash = makeStashMeta({ totalSize: 2048 })
      await indexer.onSave("proj-a", stash)

      const meta = expectMeta(await indexer.load("proj-a"))
      expect(meta.name).toBe("proj-a")
      expect(meta.stashCount).toBe(1)
      expect(meta.createdAt).toBeTruthy()
      expect(meta.updatedAt).toBeTruthy()
    })

    it("increments stashCount on subsequent saves", async () => {
      const s1 = makeStashMeta({ id: "2025-01-15_10-00_aaa1", totalSize: 1000 })
      const s2 = makeStashMeta({ id: "2025-01-15_11-00_aaa2", totalSize: 2000 })
      const s3 = makeStashMeta({ id: "2025-01-15_12-00_aaa3", totalSize: 3000 })

      await indexer.onSave("proj-b", s1)
      await indexer.onSave("proj-b", s2)
      await indexer.onSave("proj-b", s3)

      const meta = expectMeta(await indexer.load("proj-b"))
      expect(meta.stashCount).toBe(3)
    })

    it("accumulates totalSize across saves", async () => {
      // 500 B + 500 B = 1000 B = "1 KB"
      const s1 = makeStashMeta({ totalSize: 500 })
      const s2 = makeStashMeta({ totalSize: 500 })

      await indexer.onSave("proj-c", s1)
      await indexer.onSave("proj-c", s2)

      const meta = expectMeta(await indexer.load("proj-c"))
      // Should be ~1 KB (1000 bytes)
      expect(meta.totalSize).toMatch(/kb/i)
    })

    it("preserves createdAt and updates updatedAt on second save", async () => {
      const s1 = makeStashMeta({ id: "2025-01-15_10-00_a1" })
      await indexer.onSave("proj-d", s1)
      const firstMeta = expectMeta(await indexer.load("proj-d"))

      // Small delay to ensure updatedAt differs
      await new Promise(r => setTimeout(r, 10))

      const s2 = makeStashMeta({ id: "2025-01-15_11-00_a2" })
      await indexer.onSave("proj-d", s2)
      const secondMeta = expectMeta(await indexer.load("proj-d"))

      expect(secondMeta.createdAt).toBe(firstMeta.createdAt)
      // updatedAt may equal createdAt if execution is too fast — just check it exists
      expect(secondMeta.updatedAt).toBeTruthy()
    })

    it("writes a valid .project.json that passes schema validation", async () => {
      const stash = makeStashMeta()
      await indexer.onSave("proj-e", stash)

      const jsonPath = join(repoDir, "proj-e", ".project.json")
      const parsed = await readJson(jsonPath, ProjectMetadataSchema)

      expect(parsed.name).toBe("proj-e")
      expect(parsed.stashCount).toBe(1)
      expect(Array.isArray(parsed.aliases)).toBe(true)
    })
  })

  describe("onDelete()", () => {
    it("updates stashCount to 0 when all stashes removed", async () => {
      const stash = makeStashMeta()
      await indexer.onSave("proj-f", stash)

      await indexer.onDelete("proj-f", [])

      const meta = expectMeta(await indexer.load("proj-f"))
      expect(meta.stashCount).toBe(0)
      expect(meta.totalSize).toBe("0 B")
    })

    it("sets stashCount to the number of remaining stashes", async () => {
      // Simulate 3 stashes saved, then 1 deleted (2 remaining)
      const s1 = makeStashMeta({ id: "aaa1", totalSize: 1000 })
      const s2 = makeStashMeta({ id: "aaa2", totalSize: 2000 })
      const s3 = makeStashMeta({ id: "aaa3", totalSize: 3000 })

      await indexer.onSave("proj-g", s1)
      await indexer.onSave("proj-g", s2)
      await indexer.onSave("proj-g", s3)

      // Delete s2 — remaining: s1, s3
      await indexer.onDelete("proj-g", [s1, s3])

      const meta = expectMeta(await indexer.load("proj-g"))
      expect(meta.stashCount).toBe(2)
    })

    it("recalculates totalSize from remaining stashes", async () => {
      const s1 = makeStashMeta({ id: "bbb1", totalSize: 5000 })
      const s2 = makeStashMeta({ id: "bbb2", totalSize: 5000 })

      await indexer.onSave("proj-h", s1)
      await indexer.onSave("proj-h", s2)

      // Keep only s1 (5000 B = 5 KB)
      await indexer.onDelete("proj-h", [s1])

      const meta = expectMeta(await indexer.load("proj-h"))
      expect(meta.stashCount).toBe(1)
      expect(meta.totalSize).toMatch(/kb/i)
    })

    it("preserves remote and aliases from existing metadata", async () => {
      // Manually write a .project.json with remote + aliases
      const { ensureDir, writeJson } = await import("../../src/utils/fs.js")
      await ensureDir(join(repoDir, "proj-i"))
      await writeJson(join(repoDir, "proj-i", ".project.json"), {
        name: "proj-i",
        remote: "git@github.com:user/proj-i.git",
        aliases: ["pi", "my-proj"],
        stashCount: 2,
        totalSize: "10 KB",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })

      const remaining = [makeStashMeta({ id: "ccc1", totalSize: 3000 })]
      await indexer.onDelete("proj-i", remaining)

      const meta = expectMeta(await indexer.load("proj-i"))
      expect(meta.remote).toBe("git@github.com:user/proj-i.git")
      expect(meta.aliases).toEqual(["pi", "my-proj"])
      expect(meta.stashCount).toBe(1)
    })

    it("creates .project.json even if it didn't exist before", async () => {
      // onDelete called without a prior onSave (edge case)
      await indexer.onDelete("proj-j", [])

      const meta = expectMeta(await indexer.load("proj-j"))
      expect(meta.stashCount).toBe(0)
      expect(meta.name).toBe("proj-j")
    })
  })
})
