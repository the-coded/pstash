/**
 * @module core/compressor
 *
 * Stash file compression and decompression using tar.gz archives.
 *
 * Compression reduces stash repo size by bundling stash files into a single
 * `stash.tar.gz` archive per stash entry, replacing individual file copies.
 * Integrated into `Stasher.save()` and `Stasher.restore()` when `compressed: true`.
 *
 * @example
 * // Compress files in a stash directory
 * await compress("/path/to/stash/dir", ["README.md", "notes.txt"])
 *
 * // Decompress to a destination directory
 * await decompress("/path/to/stash/dir", "/path/to/dest")
 */

import { create, extract } from "tar"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { exists } from "../utils/fs.js"

/** Name of the archive file within each stash directory */
export const ARCHIVE_NAME = "stash.tar.gz"

/**
 * Compresses individual stash files into a single `stash.tar.gz` archive.
 * After successful compression, the original individual files are removed.
 *
 * @param stashDir - Absolute path to the stash directory containing the files
 * @param fileNames - Array of basenames to include in the archive (must exist in `stashDir`)
 *
 * @throws {Error} If tar creation fails
 *
 * @example
 * await compress("/home/user/.pstash/my-project/2026-03-12_01-05_k7x2", ["README.md", "notes.txt"])
 * // Creates: stashDir/stash.tar.gz
 * // Removes: stashDir/README.md, stashDir/notes.txt
 */
export async function compress(stashDir: string, fileNames: string[]): Promise<void> {
  if (fileNames.length === 0) return

  const archivePath = join(stashDir, ARCHIVE_NAME)

  await create(
    {
      gzip: true,
      file: archivePath,
      cwd: stashDir,
    },
    fileNames,
  )

  // Remove individual files after successful archiving
  for (const name of fileNames) {
    const filePath = join(stashDir, name)
    if (await exists(filePath)) {
      await rm(filePath, { force: true })
    }
  }
}

/**
 * Decompresses `stash.tar.gz` from a stash directory into the destination directory.
 *
 * @param stashDir - Absolute path to the stash directory containing `stash.tar.gz`
 * @param destDir - Absolute path to the directory where files will be extracted
 *
 * @throws {Error} If the archive does not exist at `stashDir/stash.tar.gz`
 * @throws {Error} If tar extraction fails
 *
 * @example
 * await decompress("/home/user/.pstash/my-project/2026-03-12_01-05_k7x2", "/home/user/my-project")
 * // Extracts all files from stash.tar.gz into /home/user/my-project
 */
export async function decompress(stashDir: string, destDir: string): Promise<void> {
  const archivePath = join(stashDir, ARCHIVE_NAME)

  if (!(await exists(archivePath))) {
    throw new Error(`Stash archive not found: ${archivePath}`)
  }

  await extract({
    file: archivePath,
    cwd: destDir,
  })
}
