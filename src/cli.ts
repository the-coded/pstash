/**
 * @module cli
 *
 * Main Commander.js program setup.
 * Registers all commands and provides global error handling.
 *
 * Entry point: `bin/pstash.ts` calls `run()`.
 *
 * @example
 * // pstash --help
 * // pstash save "my files" *.md
 * // pstash list --all
 */

import { Command } from "commander"
import chalk from "chalk"
import { readFile } from "node:fs/promises"
import { join, dirname } from "node:path"
import { fileURLToPath } from "node:url"
import { initCommand } from "./commands/init.js"
import { saveCommand } from "./commands/save.js"
import { updateCommand } from "./commands/update.js"
import { listCommand } from "./commands/list.js"
import { popCommand } from "./commands/pop.js"
import { applyCommand } from "./commands/apply.js"
import { syncCommand } from "./commands/sync.js"
import { showCommand } from "./commands/show.js"
import { dropCommand } from "./commands/drop.js"
import { statusCommand } from "./commands/status.js"
import { cleanCommand } from "./commands/clean.js"
import { diffCommand } from "./commands/diff.js"
import { configCommand } from "./commands/config.js"

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

/**
 * Reads the version from package.json.
 * Falls back to "0.0.0" if package.json cannot be read.
 */
async function getVersion(): Promise<string> {
  try {
    const pkgPath = join(__dirname, "..", "package.json")
    const pkg = JSON.parse(await readFile(pkgPath, "utf-8")) as { version: string }
    return pkg.version
  } catch {
    return "0.0.0"
  }
}

/**
 * Global error handler for CLI commands.
 * Formats errors consistently and exits with code 1.
 *
 * @param err - The caught error
 */
function handleError(err: unknown): never {
  const message = err instanceof Error ? err.message : String(err)
  console.error(chalk.red(`\n  ✖ Error: ${message}\n`))
  process.exit(1)
}

/**
 * Wraps an async command handler with error handling.
 *
 * @param fn - Async function to wrap
 * @returns Wrapped function that calls `handleError` on rejection
 */
function withErrorHandling<T extends unknown[]>(
  fn: (...args: T) => Promise<void>,
): (...args: T) => void {
  return (...args: T): void => {
    fn(...args).catch(handleError)
  }
}

/**
 * Creates and configures the Commander program.
 * Called once at startup by `run()`.
 */
async function createProgram(): Promise<Command> {
  const version = await getVersion()
  const program = new Command()

  program
    .name("pstash")
    .description("Git-backed personal file stash — persistent, project-categorized, multi-machine")
    .version(version, "-v, --version", "Output the current version")
    .helpOption("-h, --help", "Display help")

  // ─── pstash init ──────────────────────────────────────────────────────────

  program
    .command("init")
    .description("Initialize pstash — clone data repo and create ~/.pstashrc")
    .option("-r, --remote <url>", "SSH or HTTPS URL for your my-personal-stash repo")
    .option("-p, --path <path>", "Local path to clone to (default: ~/.pstash)")
    .action(
      withErrorHandling(opts =>
        initCommand({
          remote: opts.remote as string | undefined,
          path: opts.path as string | undefined,
        }),
      ),
    )

  // ─── pstash save ──────────────────────────────────────────────────────────

  program
    .command("save [message] [files...]")
    .description(
      "Stash files with a message.\n" +
        "  If <message> and [files...] are both omitted, runs in interactive mode.",
    )
    .option(
      "-t, --tag <tag>",
      "Add tag (repeatable)",
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option("-p, --project <name>", "Override auto-detected project name")
    .option("--no-sync", "Skip auto pull+push for this operation")
    .option("--rm", "Remove source files after saving")
    .option("--keep", "Keep source files (overrides config removeAfterSave=true)")
    .option("--compress", "Compress stash as tar.gz (overrides config defaults.compression)")
    .option(
      "--unstaged",
      "Auto-detect unstaged git files and stash them (ignores [files...] patterns)",
    )
    .action(
      withErrorHandling((message: string | undefined, files: string[], opts) =>
        saveCommand(message, files, {
          tag: opts.tag as string[],
          project: opts.project as string | undefined,
          noSync: !opts.sync as boolean,
          rm: opts.rm as boolean,
          keep: opts.keep as boolean,
          compress: opts.compress as boolean | undefined,
          unstaged: opts.unstaged as boolean,
        }),
      ),
    )

  // ─── pstash update ────────────────────────────────────────────────────────

  program
    .command("update [index] [files...]")
    .description(
      "Overwrite files of an existing stash (keeps the stash ID).\n" +
        "  If [index] is omitted, prompts for stash selection.\n" +
        "  If [files...] is omitted, prompts interactively.",
    )
    .option("-m, --message <msg>", "Override the stash message (defaults to the existing one)")
    .option(
      "-t, --tag <tag>",
      "Replace tags (repeatable). If any tag is given, existing tags are replaced.",
      (val: string, prev: string[]) => [...prev, val],
      [] as string[],
    )
    .option("-p, --project <name>", "Override auto-detected project name")
    .option("--no-sync", "Skip auto pull+push for this operation")
    .option("--compress", "Compress stash as tar.gz (overrides config defaults.compression)")
    .option(
      "--unstaged",
      "Auto-detect unstaged git files and stash them (ignores [files...] patterns)",
    )
    .option("--force", "Skip confirmation prompt")
    .action(
      withErrorHandling((index: string | undefined, files: string[], opts) =>
        updateCommand(index !== undefined ? parseInt(index, 10) : undefined, files, {
          message: opts.message as string | undefined,
          tag: opts.tag as string[],
          project: opts.project as string | undefined,
          noSync: !opts.sync as boolean,
          compress: opts.compress as boolean | undefined,
          unstaged: opts.unstaged as boolean,
          force: opts.force as boolean,
        }),
      ),
    )

  // ─── pstash list ──────────────────────────────────────────────────────────

  program
    .command("list")
    .description("List stashes for current project")
    .option("-a, --all", "List stashes from all projects")
    .option("-p, --project <name>", "Filter by project name")
    .option("-t, --tag <tag>", "Filter by tag")
    .option("--since <timespec>", "Show stashes after this date (e.g. 7d, 2w, 2026-03-01)")
    .option("--until <timespec>", "Show stashes before this date")
    .option("--preview", "Show preview of first line of each file")
    .option("--json", "Output as JSON")
    .action(
      withErrorHandling(opts =>
        listCommand({
          all: opts.all as boolean,
          project: opts.project as string | undefined,
          tag: opts.tag as string | undefined,
          since: opts.since as string | undefined,
          until: opts.until as string | undefined,
          preview: opts.preview as boolean,
          json: opts.json as boolean,
        }),
      ),
    )

  // ─── pstash pop ───────────────────────────────────────────────────────────

  program
    .command("pop [index]")
    .description("Restore stash files and delete the stash (interactive if no index given)")
    .option("-d, --dest <path>", "Destination directory (default: current directory)")
    .option("-f, --files <pattern>", "Restore only files matching glob pattern")
    .option("-p, --project <name>", "Override auto-detected project name")
    .option("--force", "Overwrite existing files")
    .action(
      withErrorHandling((index: string | undefined, opts) =>
        popCommand(index !== undefined ? parseInt(index, 10) : undefined, {
          dest: opts.dest as string | undefined,
          files: opts.files as string | undefined,
          project: opts.project as string | undefined,
          force: opts.force as boolean,
        }),
      ),
    )

  // ─── pstash apply ─────────────────────────────────────────────────────────

  program
    .command("apply [index]")
    .description("Restore stash files WITHOUT deleting the stash (interactive if no index given)")
    .option("-d, --dest <path>", "Destination directory (default: current directory)")
    .option("-f, --files <pattern>", "Restore only files matching glob pattern")
    .option("-p, --project <name>", "Override auto-detected project name")
    .option("--force", "Overwrite existing files")
    .action(
      withErrorHandling((index: string | undefined, opts) =>
        applyCommand(index !== undefined ? parseInt(index, 10) : undefined, {
          dest: opts.dest as string | undefined,
          files: opts.files as string | undefined,
          project: opts.project as string | undefined,
          force: opts.force as boolean,
        }),
      ),
    )

  // ─── pstash sync ──────────────────────────────────────────────────────────

  program
    .command("sync")
    .description("Synchronize stash repo with remote (pull + push)")
    .option("--pull", "Pull only")
    .option("--push", "Push only")
    .action(
      withErrorHandling(opts =>
        syncCommand({
          pull: opts.pull as boolean,
          push: opts.push as boolean,
        }),
      ),
    )

  // ─── pstash show ──────────────────────────────────────────────────────────

  program
    .command("show [index]")
    .description("Show details of a stash entry (interactive if no index given)")
    .option("-p, --project <name>", "Override auto-detected project name")
    .option("-f, --files", "Show file list only (no metadata)")
    .option("-c, --cat [pattern]", "Print file contents (optional glob to filter files)")
    .option("--json", "Output as JSON")
    .action(
      withErrorHandling((index: string | undefined, opts) =>
        showCommand(index !== undefined ? parseInt(index, 10) : undefined, {
          project: opts.project as string | undefined,
          files: opts.files as boolean,
          cat: opts.cat === undefined ? undefined : opts.cat === true ? "" : (opts.cat as string),
          json: opts.json as boolean,
        }),
      ),
    )

  // ─── pstash drop ──────────────────────────────────────────────────────────

  program
    .command("drop [index]")
    .description("Delete a stash entry without restoring (interactive if no index given)")
    .option("-p, --project <name>", "Override auto-detected project name")
    .option("-t, --tag <tag>", "Drop all stashes with this tag")
    .option("-a, --all", "Drop ALL stashes in the project (requires double confirmation)")
    .option("--force", "Skip confirmation prompt")
    .option("--dry-run", "Preview what would be dropped without deleting")
    .action(
      withErrorHandling((index: string | undefined, opts) =>
        dropCommand(index !== undefined ? parseInt(index, 10) : undefined, {
          project: opts.project as string | undefined,
          tag: opts.tag as string | undefined,
          all: opts.all as boolean,
          force: opts.force as boolean,
          dryRun: opts.dryRun as boolean,
        }),
      ),
    )

  // ─── pstash status ────────────────────────────────────────────────────────

  program
    .command("status")
    .description("Show stash repository status and project summary")
    .option("-a, --all", "Show status for all projects")
    .option("--json", "Output as JSON")
    .action(
      withErrorHandling(opts =>
        statusCommand({
          all: opts.all as boolean,
          json: opts.json as boolean,
        }),
      ),
    )

  // ─── pstash clean ─────────────────────────────────────────────────────────

  program
    .command("clean")
    .description("Remove old or filtered stash entries")
    .option("--older-than <timespec>", "Remove stashes older than this (e.g. 30d, 2w, 1m)")
    .option("--keep <n>", "Keep only the N most recent stashes", parseInt)
    .option("-t, --tag <tag>", "Remove only stashes with this tag")
    .option("-a, --all", "Clean across all projects")
    .option("-p, --project <name>", "Override auto-detected project name")
    .option("--dry-run", "Preview what would be deleted without actually deleting")
    .option("--force", "Skip confirmation prompt")
    .action(
      withErrorHandling(opts =>
        cleanCommand({
          olderThan: opts.olderThan as string | undefined,
          keep: opts.keep as number | undefined,
          tag: opts.tag as string | undefined,
          all: opts.all as boolean,
          project: opts.project as string | undefined,
          dryRun: opts.dryRun as boolean,
          force: opts.force as boolean,
        }),
      ),
    )

  // ─── pstash diff ──────────────────────────────────────────────────────────

  program
    .command("diff [indexA] [indexB]")
    .description("Compare two stashes, or a stash against cwd (interactive if no index given)")
    .option("-p, --project <name>", "Override auto-detected project name")
    .option("--files <pattern>", "Limit diff to files matching this glob pattern")
    .option("--stat", "Show only changed file names (no inline diff)")
    .action(
      withErrorHandling((indexA: string | undefined, indexB: string | undefined, opts) =>
        diffCommand(
          indexA !== undefined ? parseInt(indexA, 10) : undefined,
          indexB !== undefined ? parseInt(indexB, 10) : undefined,
          {
            project: opts.project as string | undefined,
            files: opts.files as string | undefined,
            stat: opts.stat as boolean,
          },
        ),
      ),
    )

  // ─── pstash config ────────────────────────────────────────────────────────

  program
    .command("config [key] [value]")
    .description(
      "View or set config values.\n" +
        "  pstash config                  — list all\n" +
        "  pstash config <key>            — get value\n" +
        "  pstash config <key> <value>    — set value",
    )
    .option("-l, --list", "List all config values (default)")
    .option("--json", "Output as JSON")
    .action(
      withErrorHandling((key: string | undefined, value: string | undefined, opts) =>
        configCommand(key, value, {
          list: opts.list as boolean,
          json: opts.json as boolean,
        }),
      ),
    )

  return program
}

/**
 * Main entry point. Creates the Commander program and parses CLI args.
 * Called from `bin/pstash.ts`.
 */
export function run(): void {
  createProgram()
    .then(program => program.parseAsync(process.argv))
    .catch(handleError)
}
