/**
 * @module commands/status
 *
 * `pstash status` — Show stash repository status and project summary.
 *
 * Displays:
 * - Remote URL and local repo path
 * - Unpushed commit count
 * - Last sync timestamp
 * - Per-project stash counts and total sizes
 *
 * @example
 * // Status for current project only
 * pstash status
 *
 * // Status for all projects
 * pstash status --all
 *
 * // Output as JSON
 * pstash status --json
 */

import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { ProjectDetector } from "../core/detector.js"
import { Stasher } from "../core/stasher.js"
import { Indexer } from "../core/indexer.js"
import { GitManager } from "../core/git.js"
import { exists } from "../utils/fs.js"
import { formatSize } from "../utils/format.js"
import { timeAgo } from "../utils/time.js"

export interface StatusCommandOptions {
  /** Show status for all projects (not just current) */
  all?: boolean
  /** Output as JSON for scripting */
  json?: boolean
}

/**
 * Executes the `pstash status` command.
 * Displays a summary of the stash repository and project-level stats.
 *
 * @param options - Display options
 *
 * @throws {Error} If config is not initialized
 */
export async function statusCommand(options: StatusCommandOptions): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)
  const git = new GitManager(repoPath)

  // Check if local stash repo exists
  const repoExists = await exists(repoPath)

  // Auto-pull before showing status (ensures we have latest data from other machines)
  if (config.autoSync && repoExists) {
    const pullSpinner = ora("Syncing...").start()
    try {
      await git.pull()
      pullSpinner.succeed(chalk.green("Synced"))
    } catch {
      pullSpinner.warn(chalk.dim("Sync failed — showing local data"))
    }
  }

  const stasher = new Stasher(repoPath)
  const indexer = new Indexer(repoPath)

  // Collect project list
  let projects: string[]
  let currentProject: string | null = null

  if (options.all) {
    projects = repoExists ? await stasher.listProjects() : []
  } else {
    try {
      const detector = new ProjectDetector()
      currentProject = await detector.detectAndResolve(config)
      projects = [currentProject]
    } catch {
      projects = []
    }
  }

  // Build project stats
  const projectStats: Array<{
    name: string
    stashCount: number
    totalSize: number
    updatedAt: string | null
    isCurrent: boolean
  }> = []

  for (const name of projects) {
    const stashes = repoExists ? await stasher.listMetadata(name) : []
    const projectMeta = repoExists ? await indexer.load(name) : null

    const totalSize = stashes.reduce((acc, s) => acc + s.totalSize, 0)
    const updatedAt = projectMeta?.updatedAt ?? stashes[0]?.timestamp ?? null

    projectStats.push({
      name,
      stashCount: stashes.length,
      totalSize,
      updatedAt,
      isCurrent: name === currentProject,
    })
  }

  // Git info
  let unpushedCount = 0
  let lastSyncTime: string | null = null

  if (repoExists) {
    try {
      unpushedCount = await git.getUnpushedCount()
    } catch {
      unpushedCount = 0
    }
    try {
      lastSyncTime = await git.getLastSyncTime()
    } catch {
      lastSyncTime = null
    }
  }

  // JSON output
  if (options.json) {
    const output = {
      remote: config.remote,
      localPath: repoPath,
      initialized: repoExists,
      unpushedCount,
      lastSyncTime,
      projects: projectStats.map(p => ({
        name: p.name,
        stashCount: p.stashCount,
        totalSize: p.totalSize,
        updatedAt: p.updatedAt,
        isCurrent: p.isCurrent,
      })),
    }
    console.log(JSON.stringify(output, null, 2))
    return
  }

  // ─── Human-readable output ────────────────────────────────────────────────

  console.log()
  console.log(chalk.bold("  pstash status"))
  console.log()

  // Remote + local path
  console.log(`  ${chalk.dim("remote")}   ${chalk.cyan(config.remote)}`)
  console.log(`  ${chalk.dim("local")}    ${chalk.cyan(repoPath)}`)
  console.log()

  // Repo health
  if (!repoExists) {
    console.log(chalk.yellow("  ⚠  Stash repo not initialized.") + chalk.dim(" Run: pstash init"))
    console.log()
    return
  }

  // Sync status
  if (unpushedCount > 0) {
    console.log(
      `  ${chalk.yellow("↑")} ${chalk.bold(String(unpushedCount))} unpushed commit${unpushedCount !== 1 ? "s" : ""}` +
        chalk.dim(" — run: pstash sync"),
    )
  } else {
    console.log(`  ${chalk.green("✔")} ${chalk.dim("Up to date with remote")}`)
  }

  if (lastSyncTime) {
    console.log(`  ${chalk.dim("last sync")}  ${timeAgo(lastSyncTime)}`)
  }

  console.log()

  // Project stats
  if (projectStats.length === 0) {
    console.log(chalk.dim("  No stashes yet.\n"))
    return
  }

  const header = `  ${"PROJECT".padEnd(24)}  ${"STASHES".padStart(7)}  ${"SIZE".padStart(10)}  UPDATED`
  console.log(chalk.dim(header))
  console.log(chalk.dim("  " + "─".repeat(60)))

  let grandTotal = 0
  let grandCount = 0

  for (const p of projectStats) {
    const name = p.isCurrent ? chalk.bold.cyan(p.name) : chalk.white(p.name)
    const indicator = p.isCurrent ? chalk.cyan(" ●") : "  "
    const count = chalk.bold(String(p.stashCount).padStart(7))
    const size = chalk.dim(formatSize(p.totalSize).padStart(10))
    const updated = p.updatedAt ? chalk.dim(timeAgo(p.updatedAt)) : chalk.dim("never")

    console.log(`${indicator} ${name.padEnd(22)}  ${count}  ${size}  ${updated}`)

    grandTotal += p.totalSize
    grandCount += p.stashCount
  }

  if (projectStats.length > 1) {
    console.log(chalk.dim("  " + "─".repeat(60)))
    console.log(
      `  ${"TOTAL".padEnd(24)}  ${chalk.bold(String(grandCount).padStart(7))}  ${chalk.dim(formatSize(grandTotal).padStart(10))}`,
    )
  }

  console.log()
}
