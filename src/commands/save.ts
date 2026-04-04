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
 *
 * // Skip auto pull+push for this operation
 * pstash save --no-sync "quick local save" *.md
 */

import chalk from "chalk"
import ora from "ora"
import { simpleGit } from "simple-git"
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
  /** Skip auto pull+push for this operation (overrides config.autoSync) */
  noSync?: boolean
  /** Remove source files after saving (overrides config) */
  rm?: boolean
  /** Keep source files after saving (overrides config) */
  keep?: boolean
  /** Disable compression (overrides config defaults.compression) */
  noCompress?: boolean
  /**
   * Auto-detect unstaged (modified + untracked) files from git status and stash them.
   * When set, any explicit [files...] patterns are ignored.
   */
  unstaged?: boolean
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
 * @throws {Error} If git push fails and `--no-sync` is not set
 */
export async function saveCommand(
  message: string,
  filePatterns: string[],
  options: SaveCommandOptions,
): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)
  const git = new GitManager(repoPath)

  // Auto pull before saving (ensures we have the latest stashes from other machines)
  if (config.autoSync && !options.noSync) {
    const pullSpinner = ora("Pulling latest changes...").start()
    try {
      await git.pull()
      pullSpinner.succeed(chalk.green("Pulled latest changes"))
    } catch {
      pullSpinner.warn(chalk.dim("Pull failed — saving to local stash"))
    }
  }

  // Detect project name (git remote → basename fallback)
  const detector = new ProjectDetector()
  const rawProject = options.project ?? (await detector.detectAndResolve(config))
  const project = rawProject

  console.log(chalk.dim(`  Project: ${chalk.white(project)}`))

  // Get git context for metadata
  const branch = await detector.getCurrentBranch()
  const commit = await detector.getCurrentCommit()

  // Resolve file patterns — use git unstaged files if --unstaged is set
  let resolvedPatterns = filePatterns
  if (options.unstaged) {
    const projectGit = simpleGit(process.cwd())
    let status
    try {
      status = await projectGit.status()
    } catch {
      throw new Error("--unstaged requires a git repository in the current directory")
    }
    // modified (not staged) + untracked files
    const unstagedFiles = [...status.not_added, ...status.modified]
    if (unstagedFiles.length === 0) {
      console.log(chalk.yellow("  No unstaged files found."))
      return
    }
    resolvedPatterns = unstagedFiles
    console.log(chalk.dim(`  Unstaged files detected: ${unstagedFiles.length}`))
  }

  // Save stash
  const spinner = ora("Saving stash...").start()
  const stasher = new Stasher(repoPath)

  let metadata
  try {
    const shouldCompress = !options.noCompress && config.defaults.compression

    metadata = await stasher.save({
      project,
      message,
      files: resolvedPatterns,
      tags: options.tag ?? [],
      branch,
      commit,
      compress: shouldCompress,
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
  try {
    await git.commitAll(`stash(${project}): ${message}`)
    gitSpinner.succeed(chalk.green("Committed"))
  } catch (err) {
    gitSpinner.fail(chalk.red("Commit failed"))
    throw err
  }

  // Auto push after saving (unless --no-sync or autoSync is off)
  if (config.autoSync && !options.noSync) {
    const pushSpinner = ora("Pushing to remote...").start()
    try {
      await git.push()
      pushSpinner.succeed(chalk.green("Pushed to remote"))
    } catch {
      pushSpinner.warn(chalk.yellow("Push failed (run pstash sync to retry)"))
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
