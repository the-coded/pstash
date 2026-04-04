/**
 * @module commands/list
 *
 * `pstash list` — List stashes for the current or specified project.
 *
 * @example
 * // List stashes for current project
 * pstash list
 *
 * // List all projects
 * pstash list --all
 *
 * // Filter by tag
 * pstash list --tag docs --since 7d
 *
 * // Output as JSON for scripting
 * pstash list --json | jq '.[0].message'
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { ProjectDetector } from "../core/detector.js"
import { Stasher } from "../core/stasher.js"
import { GitManager } from "../core/git.js"
import { exists } from "../utils/fs.js"
import { formatStashLine } from "../utils/format.js"
import { parseTimespec, isAfter, isBefore } from "../utils/time.js"
import type { StashMetadata } from "../schemas.js"

export interface ListCommandOptions {
  /** Show all projects */
  all?: boolean
  /** Filter by project name */
  project?: string
  /** Filter by tag */
  tag?: string
  /** Show stashes after this timespec (e.g. "7d", "2026-03-01") */
  since?: string
  /** Show stashes before this timespec */
  until?: string
  /** Show first 3 lines of each file */
  preview?: boolean
  /** Output as JSON for scripting */
  json?: boolean
}

/**
 * Executes the `pstash list` command.
 *
 * @param options - Filter and display options
 *
 * @throws {Error} If config is not initialized
 */
export async function listCommand(options: ListCommandOptions): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)
  const git = new GitManager(repoPath)

  // Auto pull before listing (ensures fresh data from other machines)
  if (config.autoSync) {
    const pullSpinner = ora("Syncing...").start()
    try {
      await git.pull()
      pullSpinner.succeed(chalk.green("Synced"))
    } catch {
      pullSpinner.warn(chalk.dim("Sync failed — showing local data"))
    }
  }

  const stasher = new Stasher(repoPath)

  // Determine which projects to list
  let projects: string[]
  if (options.all) {
    projects = await stasher.listProjects()
  } else if (options.project) {
    projects = [options.project]
  } else {
    const detector = new ProjectDetector()
    const current = await detector.detectAndResolve(config)
    projects = [current]
  }

  if (projects.length === 0) {
    console.log(chalk.dim("\n  No stashes found.\n"))
    return
  }

  // Parse time filters
  const sinceDate = options.since ? parseTimespec(options.since) : null
  const untilDate = options.until ? parseTimespec(options.until) : null

  // Collect and filter stashes per project
  const result: Record<string, StashMetadata[]> = {}
  let totalCount = 0

  for (const project of projects) {
    let stashes = await stasher.listMetadata(project)

    // Apply filters
    if (options.tag) {
      stashes = stashes.filter(s => s.tags.includes(options.tag!))
    }
    if (sinceDate) {
      stashes = stashes.filter(s => isAfter(s.timestamp, sinceDate))
    }
    if (untilDate) {
      stashes = stashes.filter(s => isBefore(s.timestamp, untilDate))
    }

    if (stashes.length > 0) {
      result[project] = stashes
      totalCount += stashes.length
    }
  }

  // JSON output
  if (options.json) {
    const flat = Object.values(result).flat()
    console.log(JSON.stringify(flat, null, 2))
    return
  }

  // Human-readable output
  if (totalCount === 0) {
    console.log(chalk.dim("\n  No stashes match the filters.\n"))
    return
  }

  console.log()
  for (const [project, stashes] of Object.entries(result)) {
    console.log(chalk.bold.cyan(`${project}:`))

    for (const [index, stash] of stashes.entries()) {
      console.log(`  ${formatStashLine(stash, index)}`)

      // Preview: show first 3 lines of each file
      if (options.preview) {
        for (const file of stash.files.slice(0, 3)) {
          const filePath = join(repoPath, project, stash.id, file.name)
          const preview = await getFilePreview(filePath)
          if (preview) {
            console.log(chalk.dim(`      ${file.name}: ${preview}`))
          }
        }
      }
    }
    console.log()
  }
}

/**
 * Reads the first non-empty line of a file for preview display.
 *
 * @param filePath - Absolute path to the file
 * @returns First meaningful line truncated to 80 chars, or null on error
 */
async function getFilePreview(filePath: string): Promise<string | null> {
  try {
    if (!(await exists(filePath))) return null
    const content = await readFile(filePath, "utf-8")
    const lines = content.split("\n").filter(l => l.trim().length > 0)
    const first = lines[0]?.trim()
    if (!first) return null
    return first.length > 80 ? first.slice(0, 77) + "..." : first
  } catch {
    return null
  }
}
