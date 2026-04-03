/**
 * src/commands/sync.ts
 *
 * pstash sync — Synchronize stash repo with remote (pull + push).
 */

import chalk from "chalk"
import ora from "ora"
import { loadConfig, resolveLocalPath } from "../config/loader.js"
import { GitManager } from "../core/git.js"

export interface SyncCommandOptions {
  pull?: boolean
  push?: boolean
}

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
