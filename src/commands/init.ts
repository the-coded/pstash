/**
 * src/commands/init.ts
 *
 * pstash init — Initialize personal stash by cloning data repo and creating config.
 */

import chalk from "chalk"
import ora from "ora"
import { input } from "@inquirer/prompts"
import { configExists, saveConfig, resolveLocalPath } from "../config/loader.js"
import { createDefaultConfig } from "../config/templates.js"
import { GitManager } from "../core/git.js"
import { exists } from "../utils/fs.js"

export interface InitCommandOptions {
  remote?: string
  path?: string
}

export async function initCommand(options: InitCommandOptions): Promise<void> {
  console.log(chalk.bold("\n🔧 Initializing pstash...\n"))

  // Check if already initialized
  if (await configExists()) {
    console.log(chalk.yellow("⚠️  pstash is already initialized (~/.pstashrc exists)."))
    console.log(chalk.dim('   Run "pstash config list" to see current settings.\n'))
    return
  }

  // Get remote URL
  const remoteUrl =
    options.remote ??
    (await input({
      message: "Enter your my-personal-stash repo URL (SSH recommended):",
      validate: val => {
        if (!val.trim()) return "Remote URL is required"
        return true
      },
    }))

  // Get local path
  const localPath = options.path ?? "~/.pstash"
  const resolvedPath = resolveLocalPath(localPath)

  // Clone or init repo
  const git = new GitManager(resolvedPath)

  if (await exists(resolvedPath)) {
    console.log(chalk.dim(`  ℹ Using existing local repo at ${resolvedPath}`))
    await git.configureLineEndings(resolvedPath)
  } else {
    const spinner = ora(`Cloning ${remoteUrl}...`).start()
    try {
      await git.clone(remoteUrl, resolvedPath)
      await git.configureLineEndings(resolvedPath)
      spinner.succeed(chalk.green(`Cloned to ${resolvedPath}`))
    } catch {
      spinner.fail()
      // Remote might be empty — init a new local repo
      const initSpinner = ora("Remote is empty, initializing new repo...").start()
      try {
        await git.initNewRepo(resolvedPath, remoteUrl)
        initSpinner.succeed(chalk.green(`Initialized new repo at ${resolvedPath}`))
      } catch (initErr) {
        initSpinner.fail(chalk.red("Failed to initialize repo"))
        throw initErr
      }
    }
  }

  // Create config
  const config = createDefaultConfig(remoteUrl, localPath)
  await saveConfig(config)
  console.log(chalk.green("✓ Created ~/.pstashrc"))

  console.log(chalk.bold.green("\n✅ pstash is ready!\n"))
  console.log(chalk.dim("  Next steps:"))
  console.log(chalk.dim("    cd <your-project>"))
  console.log(chalk.dim('    pstash save "my first stash" *.md\n'))
}
