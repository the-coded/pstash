/**
 * @module commands/apply
 *
 * `pstash apply` — Restore files from a stash WITHOUT deleting it.
 *
 * Like `pstash pop` but keeps the stash entry intact.
 * Useful for applying the same stash to multiple machines.
 *
 * @example
 * // Interactive selection
 * pstash apply
 *
 * // Apply specific stash by index
 * pstash apply 0
 *
 * // Apply only markdown files
 * pstash apply 0 --files "*.md"
 */

import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { ProjectDetector } from "../core/detector.js"
import { Stasher } from "../core/stasher.js"
import { selectStash } from "../utils/prompts.js"
import { formatStashDetails } from "../utils/format.js"

export interface ApplyCommandOptions {
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
 * Executes the `pstash apply` command.
 * Restores stash files without deleting the stash entry.
 *
 * @param stashIndex - 0-based index of stash to apply (newest first). If undefined, shows interactive selector.
 * @param options - Command options
 *
 * @throws {Error} If config is not initialized
 * @throws {Error} If stash index is out of range
 * @throws {Error} If destination files already exist and `--force` is not set
 */
export async function applyCommand(
  stashIndex: number | undefined,
  options: ApplyCommandOptions,
): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)
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
    const result = await selectStash(stashes, "Select a stash to apply:")
    selectedStash = result.stash
    selectedId = result.stash.id
  }

  // Restore files (stash is kept)
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
      ) +
        chalk.dim(` → ${dest === process.cwd() ? "." : dest}`) +
        chalk.dim(" (stash kept)"),
    )
  } catch (err) {
    spinner.fail(chalk.red("Restore failed"))
    throw err
  }

  // Details summary
  console.log()
  console.log(formatStashDetails(selectedStash, project))
  console.log()
}
