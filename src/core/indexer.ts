/**
 * src/core/indexer.ts
 *
 * Manages .project.json metadata files within the stash data repo.
 * Tracks stash counts, total size, and timestamps per project.
 */

import { join } from "node:path"
import { readJson, writeJson, exists } from "../utils/fs.js"
import { formatSize } from "../utils/format.js"
import { ProjectMetadataSchema } from "../schemas.js"
import type { ProjectMetadata, StashMetadata } from "../schemas.js"

export class Indexer {
  private stashRepoPath: string

  constructor(stashRepoPath: string) {
    this.stashRepoPath = stashRepoPath
  }

  private getProjectJsonPath(project: string): string {
    return join(this.stashRepoPath, project, ".project.json")
  }

  /**
   * Loads .project.json for a project.
   * Returns null if it doesn't exist yet.
   */
  async load(project: string): Promise<ProjectMetadata | null> {
    const jsonPath = this.getProjectJsonPath(project)
    if (!(await exists(jsonPath))) return null

    try {
      return await readJson(jsonPath, ProjectMetadataSchema)
    } catch {
      return null
    }
  }

  /**
   * Updates .project.json after a stash is saved.
   * Creates the file if it doesn't exist.
   */
  async onSave(project: string, stash: StashMetadata): Promise<void> {
    const existing = await this.load(project)
    const now = new Date().toISOString()

    const updated: ProjectMetadata = {
      name: project,
      remote: undefined,
      aliases: [],
      stashCount: (existing?.stashCount ?? 0) + 1,
      totalSize: formatSize((existing ? parseBytes(existing.totalSize) : 0) + stash.totalSize),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await writeJson(this.getProjectJsonPath(project), updated)
  }

  /**
   * Updates .project.json after a stash is updated in place.
   * Keeps `stashCount` unchanged and recalculates `totalSize` from all
   * current stashes (since the updated stash may have a different size).
   */
  async onUpdate(project: string, allStashes: StashMetadata[]): Promise<void> {
    const existing = await this.load(project)
    const now = new Date().toISOString()

    const totalBytes = allStashes.reduce((acc, s) => acc + s.totalSize, 0)

    const updated: ProjectMetadata = {
      name: project,
      remote: existing?.remote,
      aliases: existing?.aliases ?? [],
      stashCount: allStashes.length,
      totalSize: formatSize(totalBytes),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await writeJson(this.getProjectJsonPath(project), updated)
  }

  /**
   * Updates .project.json after a stash is deleted.
   * Recalculates count from actual stash directories.
   */
  async onDelete(project: string, remainingStashes: StashMetadata[]): Promise<void> {
    const existing = await this.load(project)
    const now = new Date().toISOString()

    const totalBytes = remainingStashes.reduce((acc, s) => acc + s.totalSize, 0)

    const updated: ProjectMetadata = {
      name: project,
      remote: existing?.remote,
      aliases: existing?.aliases ?? [],
      stashCount: remainingStashes.length,
      totalSize: formatSize(totalBytes),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }

    await writeJson(this.getProjectJsonPath(project), updated)
  }
}

/**
 * Parses a human-readable size string back to bytes (approximate).
 * e.g. "245 KB" → 245000
 */
function parseBytes(sizeStr: string): number {
  const match = /^([\d.]+)\s*(B|KB|MB|GB)?$/i.exec(sizeStr.trim())
  if (!match) return 0

  const value = parseFloat(match[1] ?? "0")
  const unit = (match[2] ?? "B").toUpperCase()

  switch (unit) {
    case "KB":
      return Math.round(value * 1000)
    case "MB":
      return Math.round(value * 1000 * 1000)
    case "GB":
      return Math.round(value * 1000 * 1000 * 1000)
    default:
      return Math.round(value)
  }
}
