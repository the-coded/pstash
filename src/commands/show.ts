/**
 * @module commands/show
 *
 * `pstash show` — Display detailed information about a stash entry.
 *
 * Shows stash metadata, file list, and optionally file contents.
 * If no index is provided, shows an interactive selector.
 *
 * @example
 * // Interactive selection
 * pstash show
 *
 * // Show specific stash by index
 * pstash show 0
 *
 * // Show file list only
 * pstash show 0 --files
 *
 * // Print file contents
 * pstash show 0 --cat
 *
 * // Output as JSON
 * pstash show 0 --json
 */

import { readFile } from "node:fs/promises"
import { join } from "node:path"
import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { ProjectDetector } from "../core/detector.js"
import { GitManager } from "../core/git.js"
import { Stasher } from "../core/stasher.js"
import { exists } from "../utils/fs.js"
import { formatSize, formatStashDetails } from "../utils/format.js"
import { selectStash } from "../utils/prompts.js"

export interface ShowCommandOptions {
  /** Override auto-detected project name */
  project?: string
  /** Print only the file list (no metadata) */
  files?: boolean
  /**
   * Print file contents. Empty string = cat all files, any pattern = filter by glob.
   * `undefined` means cat is disabled.
   */
  cat?: string
  /** Output as JSON */
  json?: boolean
}

/**
 * Executes the `pstash show` command.
 * Displays detailed information about a specific stash entry.
 *
 * @param stashIndex - 0-based index (newest first). If undefined, interactive selector is shown.
 * @param options - Display options
 *
 * @throws {Error} If config is not initialized
 * @throws {Error} If stash index is out of range
 */
export async function showCommand(
  stashIndex: number | undefined,
  options: ShowCommandOptions,
): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)

  // Auto-pull before showing (ensures we have latest stashes from other machines)
  if (config.autoSync) {
    const git = new GitManager(repoPath)
    const pullSpinner = ora("Syncing...").start()
    try {
      await git.pull()
      pullSpinner.succeed(chalk.green("Synced"))
    } catch {
      pullSpinner.warn(chalk.dim("Sync failed — showing local data"))
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

  if (stashIndex !== undefined) {
    const s = stashes[stashIndex]
    if (!s) {
      throw new Error(
        `Stash index ${stashIndex} out of range (${project} has ${stashes.length} stash${stashes.length !== 1 ? "es" : ""})`,
      )
    }
    selectedStash = s
  } else {
    const result = await selectStash(stashes, "Select a stash to inspect:")
    selectedStash = result.stash
  }

  // JSON output
  if (options.json) {
    console.log(JSON.stringify(selectedStash, null, 2))
    return
  }

  // Files-only output
  if (options.files) {
    console.log()
    console.log(chalk.bold.cyan(`${project} / ${selectedStash.id}`))
    console.log()
    for (const file of selectedStash.files) {
      console.log(`  ${chalk.green("●")} ${file.name}  ${chalk.dim(formatSize(file.size))}`)
    }
    console.log()
    return
  }

  // Full metadata output
  console.log()
  console.log(formatStashDetails(selectedStash, project))
  console.log()

  // Cat: print file contents (optionally filtered by glob pattern)
  if (options.cat !== undefined) {
    let filesToCat = selectedStash.files

    if (options.cat.length > 0) {
      const { default: micromatch } = await import("micromatch")
      const matchedNames = micromatch(
        selectedStash.files.map(f => f.name),
        options.cat,
      )
      filesToCat = selectedStash.files.filter(f => matchedNames.includes(f.name))

      if (filesToCat.length === 0) {
        console.log(chalk.yellow(`  No files match pattern: ${chalk.bold(options.cat)}\n`))
        return
      }
    }

    for (const file of filesToCat) {
      const filePath = join(repoPath, project, selectedStash.id, file.name)

      console.log(
        chalk.bold.cyan(`── ${file.name} ${"─".repeat(Math.max(0, 60 - file.name.length))}`),
      )
      console.log()

      try {
        if (!(await exists(filePath))) {
          console.log(chalk.dim("  (file not found)"))
        } else {
          const content = await readFile(filePath, "utf-8")
          const lines = content.split("\n")
          for (const [i, line] of lines.entries()) {
            const lineNum = chalk.dim(String(i + 1).padStart(4, " ") + " │ ")
            console.log(lineNum + line)
          }
        }
      } catch {
        console.log(chalk.dim("  (unable to read file)"))
      }

      console.log()
    }
  }
}
