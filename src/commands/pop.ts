/**
 * @module commands/pop
 *
 * `pstash pop` — Restore files from a stash and delete the stash entry.
 *
 * If no stash index is provided, shows an interactive selector.
 * Use `pstash apply` to restore without deleting.
 *
 * @example
 * // Interactive selection
 * pstash pop
 *
 * // Pop specific stash by index
 * pstash pop 0
 *
 * // Pop to a different directory
 * pstash pop 0 --dest ~/temp
 */

import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { ProjectDetector } from "../core/detector.js"
import { Stasher } from "../core/stasher.js"
import { Indexer } from "../core/indexer.js"
import { GitManager } from "../core/git.js"
import { selectStash } from "../utils/prompts.js"
import { formatStashDetails } from "../utils/format.js"

export interface PopCommandOptions {
  /** Destination directory for restored files (default: cwd) */
  dest?: string
  /** Glob pattern to restore only matching files (Phase 3) */
  files?: string
  /** Override auto-detected project name */
  project?: string
  /** Overwrite existing files without error */
  force?: boolean
}

/**
 * Executes the `pstash pop` command.
 * Restores stash files to the destination then deletes the stash.
 *
 * @param stashIndex - 0-based index of stash to pop (newest first). If undefined, shows interactive selector.
 * @param options - Command options
 *
 * @throws {Error} If config is not initialized
 * @throws {Error} If stash index is out of range
 * @throws {Error} If destination files already exist and `--force` is not set
 */
export async function popCommand(
  stashIndex: number | undefined,
  options: PopCommandOptions,
): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)
  const git = new GitManager(repoPath)

  // Auto pull before restoring (ensures we have the latest stashes from other machines)
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

  // Detect project
  const detector = new ProjectDetector()
  const project = options.project ?? (await detector.detectAndResolve(config))

  // Load available stashes
  const stashes = await stasher.listMetadata(project)
  if (stashes.length === 0) {
    console.log(chalk.yellow(`\n  No stashes found for project: ${chalk.bold(project)}\n`))
    return
  }

  // Select stash interactively or by index
  let selectedStash
  let selectedId: string

  if (stashIndex !== undefined) {
    const s = stashes[stashIndex]
    if (!s) {
      throw new Error(
        `Stash index ${stashIndex} out of range (${project} has ${stashes.length} stash${stashes.length !== 1 ? "es" : ""})`,
      )
    }
    selectedStash = s
    selectedId = s.id
  } else {
    const result = await selectStash(stashes, "Select a stash to pop:")
    selectedStash = result.stash
    selectedId = result.stash.id
  }

  // Restore files
  const dest = options.dest ?? process.cwd()
  const spinner = ora(`Restoring ${selectedStash.files.length} file(s)...`).start()

  try {
    await stasher.restore({
      project,
      stashId: selectedId,
      dest,
      filesPattern: options.files,
      force: options.force,
    })
    spinner.succeed(
      chalk.green(
        `Restored ${selectedStash.files.length} file${selectedStash.files.length !== 1 ? "s" : ""}`,
      ) + chalk.dim(` → ${dest === process.cwd() ? "." : dest}`),
    )
  } catch (err) {
    spinner.fail(chalk.red("Restore failed"))
    throw err
  }

  // Delete stash
  const deleteSpinner = ora("Deleting stash...").start()
  await stasher.delete(project, selectedId)
  deleteSpinner.succeed(chalk.green(`Deleted stash ${project}/${selectedId}`))

  // Update .project.json
  const remainingStashes = await stasher.listMetadata(project)
  const indexer = new Indexer(repoPath)
  await indexer.onDelete(project, remainingStashes)

  // Git commit
  const commitSpinner = ora("Committing deletion...").start()
  try {
    await git.commitAll(`drop(${project}): ${selectedStash.message}`)
    commitSpinner.succeed(chalk.green("Committed"))
  } catch {
    commitSpinner.warn(chalk.dim("Nothing to commit"))
  }

  // Auto push after popping (unless autoSync is off)
  if (config.autoSync) {
    const pushSpinner = ora("Pushing...").start()
    try {
      await git.push()
      pushSpinner.succeed(chalk.green("Pushed"))
    } catch {
      pushSpinner.warn(chalk.dim("Push failed — run pstash sync to retry"))
    }
  }

  // Details summary
  console.log()
  console.log(formatStashDetails(selectedStash, project))
  console.log()
}
