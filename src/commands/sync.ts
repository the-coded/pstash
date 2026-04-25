/**
 * @module commands/sync
 *
 * `pstash sync` — Manually synchronize the stash repo with the remote.
 *
 * Most commands already pull/push automatically when `autoSync` is on. Use
 * `pstash sync` to force a sync, retry after a failed push, or sync explicitly
 * when `autoSync` is disabled.
 *
 * @example
 * // Pull then push (default)
 * pstash sync
 *
 * // Only fetch remote changes
 * pstash sync --pull
 *
 * // Only push local commits
 * pstash sync --push
 */

import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { GitManager } from "../core/git.js"

export interface SyncCommandOptions {
  /** Only pull (skip push) */
  pull?: boolean
  /** Only push (skip pull) */
  push?: boolean
}

/**
 * Executes the `pstash sync` command.
 * Pulls, pushes, or both depending on options. When neither flag is set, runs both.
 *
 * @param options - Sync direction options
 *
 * @throws {Error} If config is not initialized
 * @throws {Error} If `git pull` or `git push` fails (rethrown after spinner)
 */
export async function syncCommand(options: SyncCommandOptions): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)
  const git = new GitManager(repoPath)

  const doPull = options.pull || (!options.pull && !options.push)
  const doPush = options.push || (!options.pull && !options.push)

  if (doPull) {
    const spinner = ora("Pulling from remote...").start()
    try {
      await git.pull()
      spinner.succeed(chalk.green("Pulled latest changes"))
    } catch (err) {
      spinner.fail(chalk.red("Pull failed"))
      throw err
    }
  }

  if (doPush) {
    const spinner = ora("Pushing to remote...").start()
    try {
      await git.push()
      spinner.succeed(chalk.green("Pushed local changes"))
    } catch (err) {
      spinner.fail(chalk.red("Push failed"))
      throw err
    }
  }
}
