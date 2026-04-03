/**
 * src/utils/fs.ts
 *
 * Cross-platform file system helpers.
 */

import { mkdir, readFile, writeFile, rm, access, stat } from "node:fs/promises"
import { join } from "node:path"
import type { ZodTypeAny, z } from "zod"
import { parseJsonWithSchema } from "./validation.js"

/**
 * Ensures a directory exists, creating it recursively if needed.
 */
export async function ensureDir(dirPath: string): Promise<void> {
  await mkdir(dirPath, { recursive: true })
}

/**
 * Checks if a file or directory exists.
 */
export async function exists(filePath: string): Promise<boolean> {
  try {
    await access(filePath)
    return true
  } catch {
    return false
  }
}

/**
 * Gets file size in bytes. Returns 0 if file doesn't exist.
 */
export async function getFileSize(filePath: string): Promise<number> {
  try {
    const s = await stat(filePath)
    return s.size
  } catch {
    return 0
  }
}

/**
 * Reads and parses a JSON file with Zod schema validation.
 */
export async function readJson<T extends ZodTypeAny>(
  filePath: string,
  schema: T,
): Promise<z.infer<T>> {
  const raw = await readFile(filePath, "utf-8")
  return parseJsonWithSchema(raw, schema, filePath)
}

/**
 * Writes data as JSON to a file, creating parent directories if needed.
 */
export async function writeJson(filePath: string, data: unknown): Promise<void> {
  await ensureDir(join(filePath, ".."))
  await writeFile(filePath, JSON.stringify(data, null, 2) + "\n", "utf-8")
}

/**
 * Removes files from the filesystem.
 * Silently skips files that don't exist.
 */
export async function removeFiles(filePaths: string[]): Promise<void> {
  await Promise.all(
    filePaths.map(async fp => {
      try {
        await rm(fp)
      } catch {
        // Ignore if file doesn't exist
      }
    }),
  )
}

/**
 * Removes a directory and all its contents.
 */
export async function removeDir(dirPath: string): Promise<void> {
  await rm(dirPath, { recursive: true, force: true })
}
