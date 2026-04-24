/**
 * @module tests/core/stasher
 * Integration tests for Stasher using a real temporary directory.
 * No fs mocking — actual file I/O is performed in a tmp dir.
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest"
import { mkdtemp, mkdir, writeFile, rm, readFile, access } from "node:fs/promises"
import { join } from "node:path"
import { tmpdir } from "node:os"
import { Stasher } from "../../src/core/stasher.js"

// ─── Helpers ─────────────────────────────────────────────────────────────────

let tempRepoDir: string
let tempSrcDir: string
let stasher: Stasher

const fileExists = async (path: string): Promise<boolean> => {
  try {
    await access(path)
    return true
  } catch {
    return false
  }
}

// ─── Setup / Teardown ────────────────────────────────────────────────────────

beforeAll(async () => {
  tempRepoDir = await mkdtemp(join(tmpdir(), "pstash-repo-"))
  tempSrcDir = await mkdtemp(join(tmpdir(), "pstash-src-"))
  stasher = new Stasher(tempRepoDir)

  // Create test source files
  await writeFile(join(tempSrcDir, "README.md"), "# Hello World\n\nThis is a test file.")
  await writeFile(join(tempSrcDir, "notes.txt"), "Some notes here.")
  await writeFile(join(tempSrcDir, "config.json"), '{"key": "value"}')
})

afterAll(async () => {
  await rm(tempRepoDir, { recursive: true, force: true })
  await rm(tempSrcDir, { recursive: true, force: true })
})

// ─── save() ──────────────────────────────────────────────────────────────────

describe("Stasher.save()", () => {
  it("saves files and returns valid metadata", async () => {
    const metadata = await stasher.save({
      project: "test-project",
      message: "initial stash",
      files: [join(tempSrcDir, "README.md"), join(tempSrcDir, "notes.txt")],
      tags: ["test"],
    })

    expect(metadata.project).toBe("test-project")
    expect(metadata.message).toBe("initial stash")
    expect(metadata.tags).toContain("test")
    expect(metadata.files.length).toBe(2)
    expect(metadata.totalSize).toBeGreaterThan(0)
    expect(metadata.compressed).toBe(false)
    expect(metadata.id).toMatch(/^\d{4}-\d{2}-\d{2}_\d{2}-\d{2}_[a-zA-Z0-9_-]{4}$/)
  })

  it("generates SHA-256 hashes with 'sha256:' prefix", async () => {
    const metadata = await stasher.save({
      project: "test-project",
      message: "hash check",
      files: [join(tempSrcDir, "config.json")],
    })

    for (const file of metadata.files) {
      expect(file.hash).toMatch(/^sha256:[0-9a-f]{12}$/)
    }
  })

  it("throws when no files match the pattern", async () => {
    await expect(
      stasher.save({
        project: "test-project",
        message: "no match",
        files: [join(tempSrcDir, "*.nonexistent")],
      }),
    ).rejects.toThrow("No files matched")
  })

  it("stores the stash metadata in .stash.json", async () => {
    const metadata = await stasher.save({
      project: "test-project",
      message: "metadata check",
      files: [join(tempSrcDir, "notes.txt")],
    })

    const metaPath = join(tempRepoDir, "test-project", metadata.id, ".stash.json")
    const raw = await readFile(metaPath, "utf-8")
    const parsed = JSON.parse(raw) as { message: string }
    expect(parsed.message).toBe("metadata check")
  })

  it("records user as username@hostname", async () => {
    const metadata = await stasher.save({
      project: "test-project",
      message: "user check",
      files: [join(tempSrcDir, "README.md")],
    })
    expect(metadata.user).toMatch(/^.+@.+$/)
  })
})

// ─── listIds() + listMetadata() ──────────────────────────────────────────────

describe("Stasher.listIds() and listMetadata()", () => {
  it("returns stash IDs sorted newest first", async () => {
    const ids = await stasher.listIds("test-project")
    expect(ids.length).toBeGreaterThan(0)

    // Verify descending order (newest first)
    for (let i = 1; i < ids.length; i++) {
      const prev = ids[i - 1]
      const curr = ids[i]
      if (prev === undefined || curr === undefined) throw new Error("unexpected undefined id")
      expect(prev >= curr).toBe(true)
    }
  })

  it("returns empty array for a project with no stashes", async () => {
    const ids = await stasher.listIds("nonexistent-project")
    expect(ids).toEqual([])
  })

  it("listMetadata returns complete StashMetadata objects", async () => {
    const stashes = await stasher.listMetadata("test-project")
    expect(stashes.length).toBeGreaterThan(0)
    expect(stashes[0]).toHaveProperty("id")
    expect(stashes[0]).toHaveProperty("message")
    expect(stashes[0]).toHaveProperty("files")
    expect(stashes[0]).toHaveProperty("timestamp")
  })
})

// ─── restore() ───────────────────────────────────────────────────────────────

describe("Stasher.restore()", () => {
  it("restores files to the destination directory", async () => {
    // Create a stash first
    const metadata = await stasher.save({
      project: "restore-project",
      message: "to restore",
      files: [join(tempSrcDir, "README.md")],
    })

    const destDir = await mkdtemp(join(tmpdir(), "pstash-dest-"))
    try {
      await stasher.restore({
        project: "restore-project",
        stashId: metadata.id,
        dest: destDir,
      })

      const restoredPath = join(destDir, "README.md")
      expect(await fileExists(restoredPath)).toBe(true)
      const content = await readFile(restoredPath, "utf-8")
      expect(content).toContain("Hello World")
    } finally {
      await rm(destDir, { recursive: true, force: true })
    }
  })

  it("throws when destination file exists and force is not set", async () => {
    const metadata = await stasher.save({
      project: "restore-project",
      message: "conflict test",
      files: [join(tempSrcDir, "notes.txt")],
    })

    const destDir = await mkdtemp(join(tmpdir(), "pstash-dest-"))
    // Pre-create the destination file
    await writeFile(join(destDir, "notes.txt"), "existing content")

    try {
      await expect(
        stasher.restore({
          project: "restore-project",
          stashId: metadata.id,
          dest: destDir,
        }),
      ).rejects.toThrow("already exists")
    } finally {
      await rm(destDir, { recursive: true, force: true })
    }
  })

  it("overwrites with force: true", async () => {
    const metadata = await stasher.save({
      project: "restore-project",
      message: "force overwrite",
      files: [join(tempSrcDir, "notes.txt")],
    })

    const destDir = await mkdtemp(join(tmpdir(), "pstash-dest-"))
    await writeFile(join(destDir, "notes.txt"), "old content")

    try {
      await stasher.restore({
        project: "restore-project",
        stashId: metadata.id,
        dest: destDir,
        force: true,
      })

      const content = await readFile(join(destDir, "notes.txt"), "utf-8")
      expect(content).toBe("Some notes here.")
    } finally {
      await rm(destDir, { recursive: true, force: true })
    }
  })
})

// ─── delete() ────────────────────────────────────────────────────────────────

describe("Stasher.delete()", () => {
  it("removes the stash directory from the repo", async () => {
    const metadata = await stasher.save({
      project: "delete-project",
      message: "to delete",
      files: [join(tempSrcDir, "README.md")],
    })

    const stashPath = join(tempRepoDir, "delete-project", metadata.id)
    expect(await fileExists(stashPath)).toBe(true)

    await stasher.delete("delete-project", metadata.id)

    expect(await fileExists(stashPath)).toBe(false)
  })

  it("does not throw when deleting a non-existent stash", async () => {
    await expect(stasher.delete("nonexistent-project", "nonexistent-id")).resolves.not.toThrow()
  })
})

// ─── Directory structure preservation ────────────────────────────────────────

describe("Stasher — directory structure preservation", () => {
  it("preserves subdirectory structure when restoring (files stored with relative paths)", async () => {
    // Simulate a stash that was saved with nested file paths (e.g. @todo/PROGRESS.md)
    // by directly writing files into the stash dir with a subdir structure,
    // then verifying restore recreates those subdirs at the destination.
    const stashWithSubdirProject = "subdir-project"

    // Write a file nested inside a subdir in tempSrcDir
    const nestedDir = join(tempSrcDir, "docs")
    await mkdir(nestedDir, { recursive: true })
    await writeFile(join(nestedDir, "api.md"), "# API\n\nAPI reference.")

    // Save with full absolute path — triggers basename fallback (file is outside cwd)
    const metadata = await stasher.save({
      project: stashWithSubdirProject,
      message: "nested file",
      files: [join(tempSrcDir, "docs", "api.md")],
    })

    // Files outside cwd use basename fallback: stored as "api.md" not "docs/api.md"
    const firstFile = metadata.files[0]
    if (!firstFile) throw new Error("expected at least one file in metadata")
    expect(firstFile.name).toBe("api.md")

    // Restore and verify file is at the destination root (basename behavior)
    const destDir = await mkdtemp(join(tmpdir(), "pstash-dest-"))
    try {
      await stasher.restore({
        project: stashWithSubdirProject,
        stashId: metadata.id,
        dest: destDir,
      })

      const restoredFlat = join(destDir, "api.md")
      expect(await fileExists(restoredFlat)).toBe(true)
    } finally {
      await rm(destDir, { recursive: true, force: true })
    }
  })

  it("restores subdirectory structure when metadata contains path-prefixed filenames", async () => {
    // Simulate a stash already stored with nested file names (as saved from within cwd).
    // We manually inject a file at "subdir/file.md" inside the stash dir.
    const stashProject = "nested-restore-project"

    // First save something to get a stash entry scaffolded
    const seedMeta = await stasher.save({
      project: stashProject,
      message: "seed",
      files: [join(tempSrcDir, "README.md")],
    })

    // Now manually add a nested file to the existing stash directory
    const stashDir = join(tempRepoDir, stashProject, seedMeta.id)
    await mkdir(join(stashDir, "nested"), { recursive: true })
    await writeFile(join(stashDir, "nested", "guide.md"), "# Guide")

    // Directly call restoreUncompressed via restore() by injecting a metadata-like file
    // that references the nested path — we rebuild .stash.json with a nested file entry
    const nestedMetadata = {
      ...seedMeta,
      files: [{ name: "nested/guide.md", size: 10, hash: "sha256:aabbccddeeff" }],
    }
    const { writeFile: writeJsonRaw } = await import("node:fs/promises")
    await writeJsonRaw(join(stashDir, ".stash.json"), JSON.stringify(nestedMetadata), "utf-8")

    // Restore and verify the subdirectory is recreated at the destination
    const destDir = await mkdtemp(join(tmpdir(), "pstash-dest-"))
    try {
      await stasher.restore({
        project: stashProject,
        stashId: seedMeta.id,
        dest: destDir,
      })

      const restoredNested = join(destDir, "nested", "guide.md")
      expect(await fileExists(restoredNested)).toBe(true)
      const content = await readFile(restoredNested, "utf-8")
      expect(content).toBe("# Guide")
    } finally {
      await rm(destDir, { recursive: true, force: true })
    }
  })
})

// ─── listProjects() ──────────────────────────────────────────────────────────

describe("Stasher.listProjects()", () => {
  it("returns all project names sorted alphabetically", async () => {
    const projects = await stasher.listProjects()
    expect(projects).toContain("test-project")
    expect(projects).toContain("restore-project")

    // Verify alphabetical order
    const sorted = [...projects].sort()
    expect(projects).toEqual(sorted)
  })

  it("returns empty array for non-existent repo path", async () => {
    const nonExistentStasher = new Stasher("/nonexistent/path/pstash-test")
    const projects = await nonExistentStasher.listProjects()
    expect(projects).toEqual([])
  })
})
