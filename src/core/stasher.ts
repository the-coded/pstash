/**
 * src/core/stasher.ts
 *
 * Core stash operations: save files to and restore from the stash repo.
 * Uses SHA-256 hashing, nanoid collision-safe IDs, and globby for patterns.
 */

import { copyFile, mkdir, readFile, readdir, rm, stat } from "node:fs/promises"
import { join, basename } from "node:path"
import { createHash } from "node:crypto"
import { userInfo, hostname } from "node:os"
import { nanoid } from "nanoid"
import { format } from "date-fns"
import { globby } from "globby"
import { StashMetadataSchema } from "../schemas.js"
import type { StashMetadata } from "../schemas.js"
import { writeJson, exists } from "../utils/fs.js"

export class Stasher {
  private stashRepoPath: string

  constructor(stashRepoPath: string) {
    this.stashRepoPath = stashRepoPath
  }

  /**
   * Saves files to the stash repo and returns the stash metadata.
   *
   * - Resolves glob patterns via globby (cross-platform)
   * - Generates SHA-256 hashes for integrity checking
   * - Creates unique ID: YYYY-MM-DD_HH-mm_XXXX (timestamp + 4-char nanoid)
   */
  async save(options: {
    project: string
    message: string
    files: string[]
    tags?: string[]
    branch?: string
    commit?: string
  }): Promise<StashMetadata> {
    const timestamp = new Date()
    // Timestamp + 4-char suffix prevents collision between machines saving in the same minute
    const id = `${format(timestamp, "yyyy-MM-dd_HH-mm")}_${nanoid(4)}`

    const stashDir = join(this.stashRepoPath, options.project, id)
    await mkdir(stashDir, { recursive: true })

    // Resolve file patterns using globby (cross-platform glob)
    const resolvedFiles = await globby(options.files, {
      cwd: process.cwd(),
      absolute: true,
      dot: true,
      onlyFiles: true,
    })

    if (resolvedFiles.length === 0) {
      // Clean up empty dir
      await rm(stashDir, { recursive: true, force: true })
      throw new Error(`No files matched the patterns: ${options.files.join(", ")}`)
    }

    // Copy files and generate SHA-256 hashes
    const fileMetadata: StashMetadata["files"] = []
    let totalSize = 0

    for (const filePath of resolvedFiles) {
      const fileName = basename(filePath)
      const dest = join(stashDir, fileName)
      await copyFile(filePath, dest)

      const content = await readFile(filePath)
      const fileStats = await stat(filePath)
      // Short hash (12 hex chars = 48 bits) — sufficient for integrity checking
      const hash = `sha256:${createHash("sha256").update(content).digest("hex").slice(0, 12)}`

      fileMetadata.push({
        name: fileName,
        size: fileStats.size,
        hash,
      })
      totalSize += fileStats.size
    }

    // Create and validate metadata
    // os.userInfo().username is cross-platform (macOS, Linux, Windows)
    const metadata = StashMetadataSchema.parse({
      id,
      project: options.project,
      timestamp: timestamp.toISOString(),
      message: options.message,
      tags: options.tags ?? [],
      branch: options.branch,
      commit: options.commit,
      user: `${userInfo().username}@${hostname()}`,
      files: fileMetadata,
      totalSize,
      compressed: false,
    })

    await writeJson(join(stashDir, ".stash.json"), metadata)

    return metadata
  }

  /**
   * Restores files from a stash to the destination directory.
   * Phase 1: Restores all files.
   * Phase 3: Partial restore via micromatch (if files pattern is provided).
   */
  async restore(options: {
    project: string
    stashId: string
    dest: string
    filesPattern?: string
    force?: boolean
  }): Promise<StashMetadata> {
    const stashDir = join(this.stashRepoPath, options.project, options.stashId)

    if (!(await exists(stashDir))) {
      throw new Error(`Stash not found: ${options.project}/${options.stashId}`)
    }

    const metadataPath = join(stashDir, ".stash.json")
    const raw = await readFile(metadataPath, "utf-8")
    const metadata = StashMetadataSchema.parse(JSON.parse(raw))

    // Determine which files to restore
    let filesToRestore = metadata.files.map(f => f.name)

    if (options.filesPattern) {
      // Phase 3: micromatch for partial restore
      const { default: micromatch } = await import("micromatch")
      filesToRestore = micromatch(filesToRestore, options.filesPattern)

      if (filesToRestore.length === 0) {
        throw new Error(`No files matched pattern: ${options.filesPattern}`)
      }
    }

    // Copy files to destination
    for (const fileName of filesToRestore) {
      const src = join(stashDir, fileName)
      const dest = join(options.dest, fileName)

      if (!options.force && (await exists(dest))) {
        throw new Error(
          `File already exists: ${dest}\n` + `Use --force to overwrite.`,
        )
      }

      await copyFile(src, dest)
    }

    return metadata
  }

  /**
   * Deletes a stash directory from the stash repo.
   */
  async delete(project: string, stashId: string): Promise<void> {
    const stashDir = join(this.stashRepoPath, project, stashId)
    await rm(stashDir, { recursive: true, force: true })
  }

  /**
   * Lists all stash IDs for a project, sorted newest first.
   */
  async listIds(project: string): Promise<string[]> {
    const projectDir = join(this.stashRepoPath, project)

    if (!(await exists(projectDir))) return []

    const entries = await readdir(projectDir, { withFileTypes: true })
    const stashDirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .map(e => e.name)
      .sort()
      .reverse() // Newest first (lexicographic sort on YYYY-MM-DD_HH-mm works correctly)

    return stashDirs
  }

  /**
   * Loads stash metadata for a specific stash.
   */
  async loadMetadata(project: string, stashId: string): Promise<StashMetadata> {
    const metadataPath = join(this.stashRepoPath, project, stashId, ".stash.json")

    if (!(await exists(metadataPath))) {
      throw new Error(`Stash metadata not found: ${project}/${stashId}`)
    }

    const raw = await readFile(metadataPath, "utf-8")
    return StashMetadataSchema.parse(JSON.parse(raw))
  }

  /**
   * Loads all stash metadata for a project, sorted newest first.
   */
  async listMetadata(project: string): Promise<StashMetadata[]> {
    const ids = await this.listIds(project)
    const results: StashMetadata[] = []

    for (const id of ids) {
      try {
        const metadata = await this.loadMetadata(project, id)
        results.push(metadata)
      } catch {
        // Skip corrupted stash entries
      }
    }

    return results
  }

  /**
   * Lists all projects in the stash repo.
   */
  async listProjects(): Promise<string[]> {
    if (!(await exists(this.stashRepoPath))) return []

    const entries = await readdir(this.stashRepoPath, { withFileTypes: true })
    return entries
      .filter(e => e.isDirectory() && !e.name.startsWith("."))
      .map(e => e.name)
      .sort()
  }
}
