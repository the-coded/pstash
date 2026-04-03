/**
 * @module commands/drop
 *
 * `pstash drop` — Delete one or more stash entries without restoring.
 *
 * Supports interactive selection, index-based deletion, tag-based bulk delete,
 * and full project wipe. Always asks for confirmation unless `--force` is set.
 * Use `--dry-run` to preview what would be dropped without actually deleting.
 *
 * @example
 * // Interactive selection
 * pstash drop
 *
 * // Drop specific stash by index
 * pstash drop 0
 *
 * // Preview what would be dropped
 * pstash drop --tag wip --dry-run
 *
 * // Drop all stashes tagged "wip"
 * pstash drop --tag wip
 *
 * // Drop ALL stashes in the current project (prompts twice)
 * pstash drop --all
 *
 * // Skip confirmation
 * pstash drop 0 --force
 */

import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { ProjectDetector } from "../core/detector.js"
import { Stasher } from "../core/stasher.js"
import { Indexer } from "../core/indexer.js"
import { GitManager } from "../core/git.js"
import { confirmAction, selectStash } from "../utils/prompts.js"
import { formatStashLine } from "../utils/format.js"
import type { StashMetadata } from "../schemas.js"

export interface DropCommandOptions {
  /** Override auto-detected project name */
  project?: string
  /** Drop all stashes with this tag */
  tag?: string
  /** Drop ALL stashes in the project (requires double confirmation) */
  all?: boolean
  /** Skip confirmation prompt */
  force?: boolean
  /** Preview what would be dropped without actually deleting */
  dryRun?: boolean
}

/**
 * Executes the `pstash drop` command.
 * Deletes stash entries from the data repo without restoring files.
 *
 * @param stashIndex - 0-based index of stash to drop (newest first). If undefined, shows interactive selector.
 * @param options - Command options
 *
 * @throws {Error} If config is not initialized
 * @throws {Error} If stash index is out of range
 */
export async function dropCommand(
  stashIndex: number | undefined,
  options: DropCommandOptions,
): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)
  const stasher = new Stasher(repoPath)

  // Detect project
  const detector = new ProjectDetector()
  const project = options.project ?? (await detector.detectAndResolve(config))

  // Load available stashes
  const allStashes = await stasher.listMetadata(project)
  if (allStashes.length === 0) {
    console.log(chalk.yellow(`\n  No stashes found for project: ${chalk.bold(project)}\n`))
    return
  }

  // Determine which stashes to drop
  let stashesToDrop: StashMetadata[]

  if (options.all) {
    // Drop ALL stashes (requires double confirmation)
    stashesToDrop = allStashes
  } else if (options.tag) {
    // Drop all stashes matching a tag
    stashesToDrop = allStashes.filter(s => s.tags.includes(options.tag!))
    if (stashesToDrop.length === 0) {
      console.log(chalk.yellow(`\n  No stashes found with tag: ${chalk.bold(options.tag)}\n`))
      return
    }
  } else if (stashIndex !== undefined) {
    // Drop by index
    const s = allStashes[stashIndex]
    if (!s) {
      throw new Error(
        `Stash index ${stashIndex} out of range (${project} has ${allStashes.length} stash${allStashes.length !== 1 ? "es" : ""})`,
      )
    }
    stashesToDrop = [s]
  } else {
    // Interactive selection
    const result = await selectStash(allStashes, "Select a stash to drop:")
    stashesToDrop = [result.stash]
  }

  // Show what will be dropped
  console.log()
  const dryLabel = options.dryRun ? chalk.yellow(" [DRY RUN]") : ""
  console.log(
    chalk.bold.red(
      `  About to drop ${stashesToDrop.length} stash${stashesToDrop.length !== 1 ? "es" : ""} from ${chalk.white(project)}:`,
    ) + dryLabel,
  )
  console.log()
  for (const [i, stash] of stashesToDrop.entries()) {
    console.log(`  ${formatStashLine(stash, i)}`)
  }
  console.log()

  // Dry run: stop here
  if (options.dryRun) {
    console.log(chalk.yellow("  Dry run — nothing was deleted.\n"))
    return
  }

  // Confirmation
  if (!options.force) {
    if (options.all) {
      // Double confirmation for --all
      const firstConfirm = await confirmAction(
        `Drop ALL ${stashesToDrop.length} stashes from ${project}?`,
      )
      if (!firstConfirm) {
        console.log(chalk.dim("\n  Aborted.\n"))
        return
      }
      const secondConfirm = await confirmAction(
        chalk.red(`Are you absolutely sure? This cannot be undone.`),
      )
      if (!secondConfirm) {
        console.log(chalk.dim("\n  Aborted.\n"))
        return
      }
    } else {
      const confirmed = await confirmAction(
        `Drop ${stashesToDrop.length} stash${stashesToDrop.length !== 1 ? "es" : ""}?`,
      )
      if (!confirmed) {
        console.log(chalk.dim("\n  Aborted.\n"))
        return
      }
    }
  }

  // Delete each stash
  const deleteSpinner = ora(
    `Dropping ${stashesToDrop.length} stash${stashesToDrop.length !== 1 ? "es" : ""}...`,
  ).start()
  let dropped = 0

  for (const stash of stashesToDrop) {
    try {
      await stasher.delete(project, stash.id)
      dropped++
    } catch (err) {
      deleteSpinner.fail(chalk.red(`Failed to drop ${stash.id}`))
      throw err
    }
  }

  deleteSpinner.succeed(
    chalk.green(`Dropped ${dropped} stash${dropped !== 1 ? "es" : ""}`) +
      chalk.dim(` from ${project}`),
  )

  // Update .project.json
  const remainingStashes = await stasher.listMetadata(project)
  const indexer = new Indexer(repoPath)
  await indexer.onDelete(project, remainingStashes)

  // Git commit + push
  const git = new GitManager(repoPath)
  const commitMsg =
    stashesToDrop.length === 1
      ? `drop(${project}): ${stashesToDrop[0]!.message}`
      : `drop(${project}): removed ${dropped} stashes`

  const commitSpinner = ora("Committing...").start()
  try {
    await git.commitAll(commitMsg)
    commitSpinner.succeed(chalk.green("Committed"))
  } catch {
    commitSpinner.warn(chalk.dim("Nothing to commit"))
  }

  if (config.defaults.autoPush) {
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
