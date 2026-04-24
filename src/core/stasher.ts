/**
 * @module core/stasher
 *
 * Core stash operations: save files to and restore from the stash data repository.
 *
 * - Save: resolves glob patterns via `globby`, computes SHA-256 hashes, generates
 *   unique IDs (`YYYY-MM-DD_HH-mm_XXXX`), and optionally compresses via `tar`.
 * - Restore: copies files back to the destination directory, with optional
 *   micromatch partial-restore and tar.gz decompression support.
 *
 * @example
 * const stasher = new Stasher("/home/user/.pstash")
 * const meta = await stasher.save({ project: "my-app", message: "WIP", files: ["*.md"] })
 * await stasher.restore({ project: "my-app", stashId: meta.id, dest: process.cwd() })
 */

import { copyFile, mkdir, mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises"
import { join, relative, dirname, basename } from "node:path"
import { tmpdir } from "node:os"
import { createHash } from "node:crypto"
import { userInfo, hostname } from "node:os"
import { nanoid } from "nanoid"
import { format } from "date-fns"
import { globby } from "globby"
import { StashMetadataSchema } from "../schemas.js"
import type { StashMetadata } from "../schemas.js"
import { writeJson, exists } from "../utils/fs.js"
import { compress, decompress } from "./compressor.js"

export class Stasher {
  private stashRepoPath: string

  /**
   * @param stashRepoPath - Absolute path to the local stash data repository (e.g. `~/.pstash`)
   */
  constructor(stashRepoPath: string) {
    this.stashRepoPath = stashRepoPath
  }

  /**
   * Saves files matching the given patterns to the stash repository.
   *
   * Steps:
   * 1. Resolve glob patterns via `globby` (cross-platform)
   * 2. Copy files to a new stash directory
   * 3. Compute SHA-256 integrity hashes (first 12 hex chars)
   * 4. Optionally compress into `stash.tar.gz` and remove individual files
   * 5. Write `.stash.json` metadata
   *
   * @param options.project - Project name (directory name in stash repo)
   * @param options.message - Human-readable description
   * @param options.files - Glob patterns relative to `process.cwd()`
   * @param options.tags - User-defined tags for filtering
   * @param options.branch - Git branch at save time
   * @param options.commit - Git commit hash at save time
   * @param options.compress - If true, compress files into `stash.tar.gz` after copying
   * @returns Validated stash metadata object
   *
   * @throws {Error} If no files match the provided patterns
   * @throws {Error} If compression fails
   *
   * @example
   * const meta = await stasher.save({
   *   project: "my-app",
   *   message: "planning docs",
   *   files: ["*.md", "docs/*.md"],
   *   tags: ["docs"],
   *   compress: true
   * })
   */
  async save(options: {
    project: string
    message: string
    files: string[]
    tags?: string[]
    branch?: string
    commit?: string
    compress?: boolean
  }): Promise<StashMetadata> {
    const timestamp = new Date()
    // Timestamp + 4-char suffix prevents collision between machines saving in the same minute
    const id = `${format(timestamp, "yyyy-MM-dd_HH-mm")}_${nanoid(4)}`

    const stashDir = join(this.stashRepoPath, options.project, id)
    await mkdir(stashDir, { recursive: true })

    let written
    try {
      written = await this.writeStashContents(stashDir, options.files, options.compress === true)
    } catch (err) {
      // Clean up empty dir on failure
      await rm(stashDir, { recursive: true, force: true })
      throw err
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
      files: written.fileMetadata,
      totalSize: written.totalSize,
      compressed: written.isCompressed,
    })

    await writeJson(join(stashDir, ".stash.json"), metadata)

    return metadata
  }

  /**
   * Replaces the contents of an existing stash with a new set of files.
   *
   * Unlike `save()`, this keeps the stash `id` and original `timestamp` intact,
   * but sets `updatedAt` to now. The stash directory is emptied before the new
   * files are written, so the stash is a full replacement (not a merge).
   *
   * @param options.project - Project name
   * @param options.stashId - ID of the stash to update
   * @param options.files - New file patterns to stash (replaces existing files)
   * @param options.message - Optional new message (defaults to the existing message)
   * @param options.tags - Optional new tags (defaults to existing tags)
   * @param options.branch - Git branch at update time
   * @param options.commit - Git commit hash at update time
   * @param options.compress - If true, compress the new contents as tar.gz
   * @returns Validated stash metadata for the updated stash
   *
   * @throws {Error} If the target stash does not exist
   * @throws {Error} If no files match the provided patterns
   */
  async update(options: {
    project: string
    stashId: string
    files: string[]
    message?: string
    tags?: string[]
    branch?: string
    commit?: string
    compress?: boolean
  }): Promise<StashMetadata> {
    const stashDir = join(this.stashRepoPath, options.project, options.stashId)

    if (!(await exists(stashDir))) {
      throw new Error(`Stash not found: ${options.project}/${options.stashId}`)
    }

    // Load existing metadata to preserve id/timestamp/message/tags defaults
    const existing = await this.loadMetadata(options.project, options.stashId)

    // Empty the stash directory (replace semantics) but keep the dir itself
    const entries = await readdir(stashDir)
    for (const entry of entries) {
      await rm(join(stashDir, entry), { recursive: true, force: true })
    }

    // If writeStashContents throws (e.g. no files matched), the stash dir
    // is left empty — the caller is responsible for deciding next steps
    // (typically: restore from git or drop the stash).
    const written = await this.writeStashContents(
      stashDir,
      options.files,
      options.compress === true,
    )

    const metadata = StashMetadataSchema.parse({
      id: existing.id,
      project: options.project,
      timestamp: existing.timestamp,
      updatedAt: new Date().toISOString(),
      message: options.message ?? existing.message,
      tags: options.tags ?? existing.tags,
      branch: options.branch,
      commit: options.commit,
      user: `${userInfo().username}@${hostname()}`,
      files: written.fileMetadata,
      totalSize: written.totalSize,
      compressed: written.isCompressed,
    })

    await writeJson(join(stashDir, ".stash.json"), metadata)

    return metadata
  }

  /**
   * Copies resolved files into a stash directory, computes hashes, and
   * optionally compresses the result. Shared between `save()` and `update()`.
   *
   * @param stashDir - Absolute path to the (empty) target stash directory
   * @param filePatterns - Glob patterns relative to `process.cwd()`
   * @param shouldCompress - Whether to compress into `stash.tar.gz` after copying
   *
   * @throws {Error} If no files match the provided patterns
   */
  private async writeStashContents(
    stashDir: string,
    filePatterns: string[],
    shouldCompress: boolean,
  ): Promise<{
    fileMetadata: StashMetadata["files"]
    totalSize: number
    isCompressed: boolean
  }> {
    // Resolve file patterns using globby (cross-platform glob)
    const resolvedFiles = await globby(filePatterns, {
      cwd: process.cwd(),
      absolute: true,
      dot: true,
      onlyFiles: true,
    })

    if (resolvedFiles.length === 0) {
      throw new Error(`No files matched the patterns: ${filePatterns.join(", ")}`)
    }

    const fileMetadata: StashMetadata["files"] = []
    const copiedFileNames: string[] = []
    let totalSize = 0

    for (const filePath of resolvedFiles) {
      // Preserve relative path from cwd so directory structure is restored correctly.
      // e.g. "@todo/PROGRESS.md" instead of just "PROGRESS.md".
      // Falls back to basename when the file is outside cwd (e.g. absolute path to /tmp/...).
      const rel = relative(process.cwd(), filePath)
      const relativePath = rel.startsWith("..") ? basename(filePath) : rel
      const dest = join(stashDir, relativePath)

      await mkdir(dirname(dest), { recursive: true })
      await copyFile(filePath, dest)

      const content = await readFile(filePath)
      const fileStats = await stat(filePath)
      const hash = `sha256:${createHash("sha256").update(content).digest("hex").slice(0, 12)}`

      fileMetadata.push({
        name: relativePath,
        size: fileStats.size,
        hash,
      })
      copiedFileNames.push(relativePath)
      totalSize += fileStats.size
    }

    if (shouldCompress) {
      await compress(stashDir, copiedFileNames)
    }

    return { fileMetadata, totalSize, isCompressed: shouldCompress }
  }

  /**
   * Restores files from a stash to the destination directory.
   *
   * - If the stash is compressed, decompresses `stash.tar.gz` to the destination.
   * - If `filesPattern` is provided, uses `micromatch` for partial restore.
   * - For compressed stashes with a `filesPattern`, extracts to a temp dir first,
   *   then copies only matching files to the destination.
   *
   * @param options.project - Project name
   * @param options.stashId - Stash ID (e.g. "2026-03-12_01-05_k7x2")
   * @param options.dest - Destination directory for restored files
   * @param options.filesPattern - Glob pattern for partial restore (e.g. "*.md")
   * @param options.force - If true, overwrite existing destination files
   * @returns Validated stash metadata object
   *
   * @throws {Error} If the stash directory or metadata is not found
   * @throws {Error} If destination files already exist and `force` is false
   * @throws {Error} If no files match the `filesPattern`
   *
   * @example
   * // Full restore
   * await stasher.restore({ project: "my-app", stashId: "2026-03-12_01-05_k7x2", dest: "/home/user/my-app" })
   *
   * // Partial restore (markdown only)
   * await stasher.restore({ project: "my-app", stashId: "...", dest: "/home/user/my-app", filesPattern: "*.md" })
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

    if (metadata.compressed) {
      await this.restoreCompressed(stashDir, metadata, options)
    } else {
      await this.restoreUncompressed(stashDir, metadata, options)
    }

    return metadata
  }

  /**
   * Restores an uncompressed stash by copying individual files.
   *
   * @param stashDir - Absolute path to the stash directory
   * @param metadata - Validated stash metadata
   * @param options - Restore options (dest, filesPattern, force)
   */
  private async restoreUncompressed(
    stashDir: string,
    metadata: StashMetadata,
    options: { dest: string; filesPattern?: string; force?: boolean },
  ): Promise<void> {
    let filesToRestore = metadata.files.map(f => f.name)

    if (options.filesPattern) {
      const { default: micromatch } = await import("micromatch")
      filesToRestore = micromatch(filesToRestore, options.filesPattern)
      if (filesToRestore.length === 0) {
        throw new Error(`No files matched pattern: ${options.filesPattern}`)
      }
    }

    for (const fileName of filesToRestore) {
      const src = join(stashDir, fileName)
      const dest = join(options.dest, fileName)

      if (!options.force && (await exists(dest))) {
        throw new Error(`File already exists: ${dest}\nUse --force to overwrite.`)
      }

      // Recreate directory structure at destination
      await mkdir(dirname(dest), { recursive: true })
      await copyFile(src, dest)
    }
  }

  /**
   * Restores a compressed stash by decompressing the tar.gz archive.
   * If `filesPattern` is provided, extracts to a temp dir and copies only matching files.
   *
   * @param stashDir - Absolute path to the stash directory
   * @param metadata - Validated stash metadata
   * @param options - Restore options (dest, filesPattern, force)
   */
  private async restoreCompressed(
    stashDir: string,
    metadata: StashMetadata,
    options: { dest: string; filesPattern?: string; force?: boolean },
  ): Promise<void> {
    if (options.filesPattern) {
      // Partial restore from compressed stash: extract to temp dir, then filter
      const tempDir = await mkdtemp(join(tmpdir(), "pstash-"))
      try {
        await decompress(stashDir, tempDir)

        const { default: micromatch } = await import("micromatch")
        const allFileNames = metadata.files.map(f => f.name)
        const matching = micromatch(allFileNames, options.filesPattern)

        if (matching.length === 0) {
          throw new Error(`No files matched pattern: ${options.filesPattern}`)
        }

        for (const fileName of matching) {
          const src = join(tempDir, fileName)
          const dest = join(options.dest, fileName)

          if (!options.force && (await exists(dest))) {
            throw new Error(`File already exists: ${dest}\nUse --force to overwrite.`)
          }

          if (await exists(src)) {
            // Recreate directory structure at destination
            await mkdir(dirname(dest), { recursive: true })
            await copyFile(src, dest)
          }
        }
      } finally {
        await rm(tempDir, { recursive: true, force: true })
      }
    } else {
      // Full restore: check for conflicts first, then decompress
      if (!options.force) {
        for (const file of metadata.files) {
          const dest = join(options.dest, file.name)
          if (await exists(dest)) {
            throw new Error(`File already exists: ${dest}\nUse --force to overwrite.`)
          }
        }
      }
      await decompress(stashDir, options.dest)
    }
  }

  /**
   * Deletes a stash directory from the stash repository.
   *
   * @param project - Project name
   * @param stashId - Stash ID to delete
   *
   * @example
   * await stasher.delete("my-app", "2026-03-12_01-05_k7x2")
   */
  async delete(project: string, stashId: string): Promise<void> {
    const stashDir = join(this.stashRepoPath, project, stashId)
    await rm(stashDir, { recursive: true, force: true })
  }

  /**
   * Lists all stash IDs for a project, sorted newest first.
   *
   * @param project - Project name
   * @returns Array of stash IDs (newest first)
   *
   * @example
   * const ids = await stasher.listIds("my-app")
   * // ["2026-03-12_01-05_k7x2", "2026-03-10_22-30_a1b2"]
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
   * Loads stash metadata for a specific stash entry.
   *
   * @param project - Project name
   * @param stashId - Stash ID
   * @returns Validated `StashMetadata` object
   *
   * @throws {Error} If the `.stash.json` metadata file is not found
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
   * Silently skips corrupted or missing stash entries.
   *
   * @param project - Project name
   * @returns Array of validated `StashMetadata` objects (newest first)
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
   * Lists all project names in the stash repository, sorted alphabetically.
   *
   * @returns Array of project directory names
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
