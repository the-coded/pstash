/**
 * @module tests/core/compressor
 *
 * Integration tests for the tar.gz compressor. These run against the real
 * filesystem in a temporary directory — no mocks of `tar` or `node:fs`.
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest"
import { mkdtemp, mkdir, writeFile, readFile, rm, readdir } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { compress, decompress, ARCHIVE_NAME } from "../../src/core/compressor.js"

let workDir: string
let stashDir: string
let destDir: string

beforeEach(async () => {
  workDir = await mkdtemp(join(tmpdir(), "pstash-compressor-"))
  stashDir = join(workDir, "stash")
  destDir = join(workDir, "dest")
  await mkdir(stashDir, { recursive: true })
  await mkdir(destDir, { recursive: true })
})

afterEach(async () => {
  await rm(workDir, { recursive: true, force: true })
})

// ─── compress ────────────────────────────────────────────────────────────────

describe("compress", () => {
  it("creates an archive and removes the original files", async () => {
    await writeFile(join(stashDir, "a.txt"), "hello a")
    await writeFile(join(stashDir, "b.txt"), "hello b")

    await compress(stashDir, ["a.txt", "b.txt"])

    const entries = await readdir(stashDir)
    expect(entries).toContain(ARCHIVE_NAME)
    expect(entries).not.toContain("a.txt")
    expect(entries).not.toContain("b.txt")
  })

  it("is a no-op when there are no files", async () => {
    await compress(stashDir, [])

    const entries = await readdir(stashDir)
    expect(entries).not.toContain(ARCHIVE_NAME)
  })
})

// ─── decompress ──────────────────────────────────────────────────────────────

describe("decompress", () => {
  it("round-trips files (compress then decompress restores content)", async () => {
    const fileA = "the quick brown fox\n"
    const fileB = "jumps over the lazy dog\n"
    await writeFile(join(stashDir, "a.txt"), fileA)
    await writeFile(join(stashDir, "b.txt"), fileB)

    await compress(stashDir, ["a.txt", "b.txt"])
    await decompress(stashDir, destDir)

    const restoredA = await readFile(join(destDir, "a.txt"), "utf-8")
    const restoredB = await readFile(join(destDir, "b.txt"), "utf-8")
    expect(restoredA).toBe(fileA)
    expect(restoredB).toBe(fileB)
  })

  it("throws when the archive is missing", async () => {
    await expect(decompress(stashDir, destDir)).rejects.toThrow("Stash archive not found")
  })
})
