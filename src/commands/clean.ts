/**
 * @module commands/clean
 *
 * `pstash clean` — Remove old or filtered stash entries.
 *
 * Supports pruning by age, tag, and keeping only the N most recent stashes.
 * Always shows a preview and asks for confirmation unless `--force` is set.
 * Use `--dry-run` to preview what would be deleted without actually deleting.
 *
 * @example
 * // Remove stashes older than 30 days
 * pstash clean --older-than 30d
 *
 * // Keep only the 5 most recent stashes
 * pstash clean --keep 5
 *
 * // Remove all stashes tagged "wip" (dry-run first)
 * pstash clean --tag wip --dry-run
 *
 * // Clean across all projects
 * pstash clean --older-than 2w --all
 */

import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { ProjectDetector } from "../core/detector.js"
import { Stasher } from "../core/stasher.js"
import { Indexer } from "../core/indexer.js"
import { GitManager } from "../core/git.js"
import { confirmAction } from "../utils/prompts.js"
import { formatStashLine, formatSize } from "../utils/format.js"
import { parseTimespec, isBefore } from "../utils/time.js"
import type { StashMetadata } from "../schemas.js"

export interface CleanCommandOptions {
  /** Remove stashes older than this timespec (e.g. "30d", "2w", "1m") */
  olderThan?: string
  /** Keep only N most recent stashes per project (delete the rest) */
  keep?: number
  /** Remove only stashes with this tag */
  tag?: string
  /** Clean stashes across all projects */
  all?: boolean
  /** Override auto-detected project name */
  project?: string
  /** Preview what would be deleted without actually deleting */
  dryRun?: boolean
  /** Skip confirmation prompt */
  force?: boolean
}

/**
 * Executes the `pstash clean` command.
 * Removes stash entries matching the given criteria from the data repo.
 *
 * @param options - Filter and behavior options
 *
 * @throws {Error} If config is not initialized
 * @throws {Error} If no filter criteria are provided (safety guard)
 */
export async function cleanCommand(options: CleanCommandOptions): Promise<void> {
  // Safety guard: require at least one filter
  if (!options.olderThan && !options.keep && !options.tag) {
    throw new Error(
      "No filter specified. Use --older-than <timespec>, --keep <n>, or --tag <tag>.\n" +
        "Example: pstash clean --older-than 30d",
    )
  }

  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)
  const git = new GitManager(repoPath)

  // Auto pull before cleaning (ensures we have the latest state from other machines)
  if (config.autoSync) {
    const pullSpinner = ora("Pulling latest changes...").start()
    try {
      await git.pull()
      pullSpinner.succeed(chalk.green("Pulled latest changes"))
    } catch {
      pullSpinner.warn(chalk.dim("Pull failed — working with local stash"))
    }
  }

  const stasher = new Stasher(repoPath)

  // Determine which projects to clean
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
    console.log(chalk.dim("\n  No stashes to clean.\n"))
    return
  }

  // Collect stashes to delete across all selected projects
  const toDelete: Array<{ project: string; stash: StashMetadata }> = []

  const cutoffDate = options.olderThan ? parseTimespec(options.olderThan) : null

  for (const project of projects) {
    const stashes = await stasher.listMetadata(project)
    if (stashes.length === 0) continue

    let candidates = stashes

    // Filter by tag
    if (options.tag) {
      const tag = options.tag
      candidates = candidates.filter(s => s.tags.includes(tag))
    }

    // Filter by --older-than
    if (cutoffDate) {
      candidates = candidates.filter(s => isBefore(s.timestamp, cutoffDate))
    }

    // Filter by --keep N (stashes are newest-first; keep first N, delete the rest)
    if (options.keep !== undefined && options.keep >= 0) {
      const keepCount = options.keep
      // After other filters, also enforce the keep count on the full stash list
      const sortedAll = stashes // already newest-first
      const toKeepIds = new Set(sortedAll.slice(0, keepCount).map(s => s.id))
      candidates = candidates.filter(s => !toKeepIds.has(s.id))
    }

    for (const stash of candidates) {
      toDelete.push({ project, stash })
    }
  }

  if (toDelete.length === 0) {
    console.log(chalk.dim("\n  No stashes match the clean criteria.\n"))
    return
  }

  // Calculate total size
  const totalSize = toDelete.reduce((acc, { stash }) => acc + stash.totalSize, 0)

  // Preview
  console.log()
  const dryLabel = options.dryRun ? chalk.yellow(" [DRY RUN]") : ""
  console.log(
    chalk.bold.red(
      `  About to remove ${toDelete.length} stash${toDelete.length !== 1 ? "es" : ""}` +
        ` (${formatSize(totalSize)} total)${dryLabel}:`,
    ),
  )
  console.log()

  let currentProject = ""
  let indexInProject = 0
  for (const { project, stash } of toDelete) {
    if (project !== currentProject) {
      currentProject = project
      indexInProject = 0
      console.log(chalk.bold.cyan(`  ${project}:`))
    }
    console.log(`    ${formatStashLine(stash, indexInProject++)}`)
  }
  console.log()

  // Dry run: stop here
  if (options.dryRun) {
    console.log(chalk.yellow("  Dry run — nothing was deleted.\n"))
    return
  }

  // Confirmation
  if (!options.force) {
    const confirmed = await confirmAction(
      `Remove ${toDelete.length} stash${toDelete.length !== 1 ? "es" : ""}? This cannot be undone.`,
    )
    if (!confirmed) {
      console.log(chalk.dim("\n  Aborted.\n"))
      return
    }
  }

  // Delete stashes
  const spinner = ora(
    `Cleaning ${toDelete.length} stash${toDelete.length !== 1 ? "es" : ""}...`,
  ).start()
  let removed = 0
  const affectedProjects = new Set<string>()

  for (const { project, stash } of toDelete) {
    try {
      await stasher.delete(project, stash.id)
      affectedProjects.add(project)
      removed++
    } catch {
      // Continue cleaning even if one stash fails
    }
  }

  spinner.succeed(
    chalk.green(`Removed ${removed} stash${removed !== 1 ? "es" : ""}`) +
      chalk.dim(` (${formatSize(totalSize)} freed)`),
  )

  // Update .project.json for each affected project
  const indexer = new Indexer(repoPath)
  for (const project of affectedProjects) {
    const remaining = await stasher.listMetadata(project)
    await indexer.onDelete(project, remaining)
  }

  // Git commit
  const projectList = [...affectedProjects].join(", ")
  const commitMsg =
    removed === 1
      ? `clean(${projectList}): removed 1 stash`
      : `clean(${projectList}): removed ${removed} stashes`

  const commitSpinner = ora("Committing...").start()
  try {
    await git.commitAll(commitMsg)
    commitSpinner.succeed(chalk.green("Committed"))
  } catch {
    commitSpinner.warn(chalk.dim("Nothing to commit"))
  }

  // Auto push after cleaning (unless autoSync is off)
  if (config.autoSync) {
    const pushSpinner = ora("Pushing...").start()
    try {
      await git.push()
      pushSpinner.succeed(chalk.green("Pushed"))
    } catch {
      pushSpinner.warn(chalk.dim("Push failed — run pstash sync to retry"))
    }
  }

  console.log()
}
