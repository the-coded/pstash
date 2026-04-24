/**
 * @module commands/update
 *
 * `pstash update` — Overwrite the files of an existing stash, preserving its ID.
 *
 * Similar to `pstash save`, but targets a specific stash instead of creating a
 * new one. The stash's `id` and original `timestamp` are kept; `updatedAt` is
 * set to now. Files inside the stash are fully replaced (not merged).
 *
 * Message and tags are preserved from the existing stash unless new ones are
 * provided via `-m` / `-t`.
 *
 * @example
 * // Interactive: pick a stash, then pick files
 * pstash update
 *
 * // Update stash #1 with current markdown files
 * pstash update 1 *.md
 *
 * // Update with new message and tags (replaces existing tags)
 * pstash update 0 -m "revised notes" -t docs -t v2 notes.md
 *
 * // Update from git unstaged files
 * pstash update 0 --unstaged
 */

import chalk from "chalk"
import ora from "ora"
import { simpleGit } from "simple-git"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { ProjectDetector } from "../core/detector.js"
import { Stasher } from "../core/stasher.js"
import { Indexer } from "../core/indexer.js"
import { GitManager } from "../core/git.js"
import { formatStashLine } from "../utils/format.js"
import { confirmAction, promptFilePatterns, selectStash } from "../utils/prompts.js"

export interface UpdateCommandOptions {
  /** New message for the stash (defaults to existing message) */
  message?: string
  /** Tags to set on the stash (repeatable: -t docs -t wip). If any tag is provided, replaces existing tags. */
  tag?: string[]
  /** Override auto-detected project name */
  project?: string
  /** Skip auto pull+push for this operation (overrides config.autoSync) */
  noSync?: boolean
  /** Enable compression as tar.gz (overrides config defaults.compression) */
  compress?: boolean
  /**
   * Auto-detect unstaged (modified + untracked) files from git status.
   * When set, any explicit [files...] patterns are ignored.
   */
  unstaged?: boolean
  /** Skip the confirmation prompt */
  force?: boolean
}

/**
 * Executes the `pstash update` command.
 *
 * @param stashIndex - 0-based index of the stash to update (newest first).
 *   If undefined, shows an interactive selector.
 * @param filePatterns - Glob patterns for the new file contents.
 *   If empty (and `--unstaged` is not set), prompts interactively.
 * @param options - Command flags and overrides
 *
 * @throws {Error} If config is not initialized
 * @throws {Error} If the project has no stashes
 * @throws {Error} If the stash index is out of range
 * @throws {Error} If no files match the provided patterns
 */
export async function updateCommand(
  stashIndex: number | undefined,
  filePatterns: string[],
  options: UpdateCommandOptions,
): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)
  const git = new GitManager(repoPath)

  // Auto pull before updating (ensures we're working with the latest state)
  if (config.autoSync && !options.noSync) {
    const pullSpinner = ora("Pulling latest changes...").start()
    try {
      await git.pull()
      pullSpinner.succeed(chalk.green("Pulled latest changes"))
    } catch {
      pullSpinner.warn(chalk.dim("Pull failed — working with local stash"))
    }
  }

  // Detect project
  const detector = new ProjectDetector()
  const project = options.project ?? (await detector.detectAndResolve(config))
  console.log(chalk.dim(`  Project: ${chalk.white(project)}`))

  const stasher = new Stasher(repoPath)

  // Load available stashes and pick the target
  const allStashes = await stasher.listMetadata(project)
  if (allStashes.length === 0) {
    console.log(chalk.yellow(`\n  No stashes found for project: ${chalk.bold(project)}\n`))
    return
  }

  let targetStash
  if (stashIndex !== undefined) {
    const s = allStashes[stashIndex]
    if (!s) {
      throw new Error(
        `Stash index ${stashIndex} out of range (${project} has ${allStashes.length} stash${allStashes.length !== 1 ? "es" : ""})`,
      )
    }
    targetStash = s
  } else {
    const picked = await selectStash(allStashes, "Select a stash to update:")
    targetStash = picked.stash
  }

  // Resolve file patterns (explicit, --unstaged, or interactive prompt)
  let resolvedPatterns = filePatterns
  if (options.unstaged) {
    const projectGit = simpleGit(process.cwd())
    let status
    try {
      status = await projectGit.status()
    } catch {
      throw new Error("--unstaged requires a git repository in the current directory")
    }
    const unstagedFiles = [...status.not_added, ...status.modified]
    if (unstagedFiles.length === 0) {
      console.log(chalk.yellow("  No unstaged files found."))
      return
    }
    resolvedPatterns = unstagedFiles
    console.log(chalk.dim(`  Unstaged files detected: ${unstagedFiles.length}`))
  } else if (resolvedPatterns.length === 0) {
    resolvedPatterns = await promptFilePatterns()
  }

  // Confirmation — updating is destructive (replaces all files in the stash)
  if (!options.force) {
    console.log()
    console.log(chalk.bold(`  About to update stash ${chalk.white(targetStash.id)}:`))
    console.log(`  ${formatStashLine(targetStash, 0)}`)
    console.log(chalk.dim(`  (files inside the stash will be fully replaced)`))
    console.log()
    const confirmed = await confirmAction("Proceed?")
    if (!confirmed) {
      console.log(chalk.dim("\n  Aborted.\n"))
      return
    }
  }

  // Git context for metadata
  const branch = await detector.getCurrentBranch()
  const commit = await detector.getCurrentCommit()

  const shouldCompress = options.compress ?? config.defaults.compression
  // When `-t` is given (even once), replace tags. Otherwise keep existing.
  const tagOverride = options.tag && options.tag.length > 0 ? options.tag : undefined

  // Perform the update
  const spinner = ora("Updating stash...").start()
  let metadata
  try {
    metadata = await stasher.update({
      project,
      stashId: targetStash.id,
      files: resolvedPatterns,
      message: options.message,
      tags: tagOverride,
      branch,
      commit,
      compress: shouldCompress,
    })
    spinner.succeed(
      chalk.green(
        `Updated ${metadata.files.length} file${metadata.files.length !== 1 ? "s" : ""}`,
      ) + chalk.dim(` → ${project}/${metadata.id}`),
    )
  } catch (err) {
    spinner.fail(chalk.red("Update failed"))
    throw err
  }

  // Update .project.json (totalSize may have changed)
  const allStashesAfter = await stasher.listMetadata(project)
  const indexer = new Indexer(repoPath)
  await indexer.onUpdate(project, allStashesAfter)

  // Git commit
  const commitSpinner = ora("Committing...").start()
  try {
    await git.commitAll(`update(${project}): ${metadata.message}`)
    commitSpinner.succeed(chalk.green("Committed"))
  } catch {
    commitSpinner.warn(chalk.dim("Nothing to commit"))
  }

  // Auto push after updating (unless --no-sync or autoSync is off)
  if (config.autoSync && !options.noSync) {
    const pushSpinner = ora("Pushing to remote...").start()
    try {
      await git.push()
      pushSpinner.succeed(chalk.green("Pushed to remote"))
    } catch {
      pushSpinner.warn(chalk.yellow("Push failed (run pstash sync to retry)"))
    }
  }

  // Summary
  console.log()
  console.log(chalk.bold("✅ Stash updated:"))
  console.log(chalk.dim(`   ${formatStashLine(metadata, 0)}`))
  console.log()
}
