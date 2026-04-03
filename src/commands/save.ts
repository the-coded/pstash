/**
 * @module commands/save
 *
 * `pstash save` — Stash files to the personal stash repo.
 *
 * @example
 * // Basic save
 * pstash save "planning docs" *.md
 *
 * // With tags and auto-detect project
 * pstash save -t docs -t wip "roadmap drafts" 1*.md 2*.md
 *
 * // Remove source files after saving
 * pstash save --rm "archived config" *.json
 */

import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { ProjectDetector } from "../core/detector.js"
import { Stasher } from "../core/stasher.js"
import { Indexer } from "../core/indexer.js"
import { GitManager } from "../core/git.js"
import { removeFiles } from "../utils/fs.js"
import { formatStashLine } from "../utils/format.js"
import { globby } from "globby"

export interface SaveCommandOptions {
  /** Tags to associate with the stash (repeatable: -t docs -t wip) */
  tag?: string[]
  /** Override auto-detected project name */
  project?: string
  /** Skip pushing to remote after save */
  noPush?: boolean
  /** Remove source files after saving (overrides config) */
  rm?: boolean
  /** Keep source files after saving (overrides config) */
  keep?: boolean
}

/**
 * Executes the `pstash save` command.
 *
 * @param message - Human-readable description of what was stashed
 * @param filePatterns - Glob patterns for files to stash (e.g. `["*.md", "src/*.ts"]`)
 * @param options - Command flags and overrides
 *
 * @throws {Error} If no files match the provided patterns
 * @throws {Error} If config is not initialized (`~/.pstashrc` missing)
 * @throws {Error} If git push fails and `--no-push` is not set
 */
export async function saveCommand(
  message: string,
  filePatterns: string[],
  options: SaveCommandOptions,
): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)

  // Detect project name (git remote → basename fallback)
  const detector = new ProjectDetector()
  const rawProject = options.project ?? (await detector.detectAndResolve(config))
  const project = rawProject

  console.log(chalk.dim(`  Project: ${chalk.white(project)}`))

  // Get git context for metadata
  const branch = await detector.getCurrentBranch()
  const commit = await detector.getCurrentCommit()

  // Save stash
  const spinner = ora("Saving stash...").start()
  const stasher = new Stasher(repoPath)

  let metadata
  try {
    metadata = await stasher.save({
      project,
      message,
      files: filePatterns,
      tags: options.tag ?? [],
      branch,
      commit,
    })
    spinner.succeed(
      chalk.green(`Saved ${metadata.files.length} file${metadata.files.length !== 1 ? "s" : ""}`) +
        chalk.dim(` → ${project}/${metadata.id}`),
    )
  } catch (err) {
    spinner.fail(chalk.red("Save failed"))
    throw err
  }

  // Update .project.json
  const indexer = new Indexer(repoPath)
  await indexer.onSave(project, metadata)

  // Git commit
  const gitSpinner = ora("Committing...").start()
  const git = new GitManager(repoPath)
  try {
    await git.commitAll(`stash(${project}): ${message}`)
    gitSpinner.succeed(chalk.green("Committed"))
  } catch (err) {
    gitSpinner.fail(chalk.red("Commit failed"))
    throw err
  }

  // Push (unless --no-push or autoSync/autoPush is off)
  const shouldPush = !options.noPush && config.defaults.autoPush
  if (shouldPush) {
    const pushSpinner = ora("Pushing to remote...").start()
    try {
      await git.push()
      pushSpinner.succeed(chalk.green("Pushed to remote"))
    } catch (err) {
      pushSpinner.fail(chalk.yellow("Push failed (run pstash sync to retry)"))
      // Don't throw — stash is saved locally
    }
  }

  // Remove source files (Phase 2 feature, but hook available in Phase 1)
  const shouldRemove =
    options.rm === true
      ? true
      : options.keep === true
        ? false
        : (config.defaults.removeAfterSave ?? false)

  if (shouldRemove) {
    const resolvedFiles = await globby(filePatterns, {
      cwd: process.cwd(),
      absolute: true,
      dot: true,
      onlyFiles: true,
    })
    await removeFiles(resolvedFiles)
    console.log(chalk.dim(`  Removed ${resolvedFiles.length} source file(s)`))
  }

  // Summary
  console.log()
  console.log(chalk.bold("✅ Stash saved:"))
  console.log(chalk.dim(`   ${formatStashLine(metadata, 0)}`))
  console.log()
}
