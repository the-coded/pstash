/**
 * @module commands/diff
 *
 * `pstash diff` — Compare two stashes or a stash against the current working directory.
 *
 * When one stash index is provided, compares it against the matching file in cwd.
 * When two stash indices are provided, compares them directly.
 * Without arguments, shows an interactive selector.
 *
 * Uses a built-in LCS-based diff algorithm (no external tools required).
 * Falls back to file-level summary for binary or very large files (> 5000 lines).
 *
 * @example
 * // Compare stash 0 against cwd
 * pstash diff 0
 *
 * // Compare stash 0 against stash 1
 * pstash diff 0 1
 *
 * // Interactive selection
 * pstash diff
 *
 * // Limit to files matching a pattern
 * pstash diff 0 --files "*.md"
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
import { selectDiffTarget, selectStash } from "../utils/prompts.js"
import type { StashMetadata } from "../schemas.js"

export interface DiffCommandOptions {
  /** Override auto-detected project name */
  project?: string
  /** Limit diff to files matching this glob pattern */
  files?: string
  /** Show only file names that differ (no inline diff) */
  stat?: boolean
}

/** Maximum number of lines before falling back to file-level summary */
const MAX_DIFF_LINES = 5000

/** Represents a single diff entry with change type */
type DiffEntry = { type: "add" | "remove" | "same"; line: string }

/**
 * Computes a line-level diff between two arrays of lines using LCS.
 *
 * @param a - Lines from the "before" version
 * @param b - Lines from the "after" version
 * @returns Array of diff entries tagged as "same", "remove", or "add"
 */
function computeDiff(a: string[], b: string[]): DiffEntry[] {
  const m = a.length
  const n = b.length

  // Build LCS DP table (O(m*n) time and space).
  // Flat 1D array indexed as `i * (n + 1) + j` — avoids repeated bounds checks
  // that `noUncheckedIndexedAccess` forces on nested arrays.
  const width = n + 1
  const dp: number[] = new Array<number>((m + 1) * width).fill(0)
  const idx = (i: number, j: number): number => i * width + j

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[idx(i, j)] = (dp[idx(i - 1, j - 1)] ?? 0) + 1
      } else {
        dp[idx(i, j)] = Math.max(dp[idx(i - 1, j)] ?? 0, dp[idx(i, j - 1)] ?? 0)
      }
    }
  }

  // Backtrack to build diff sequence
  const result: DiffEntry[] = []
  let i = m
  let j = n

  while (i > 0 || j > 0) {
    const ai = i > 0 ? a[i - 1] : undefined
    const bj = j > 0 ? b[j - 1] : undefined

    if (i > 0 && j > 0 && ai !== undefined && ai === bj) {
      result.unshift({ type: "same", line: ai })
      i--
      j--
    } else {
      const leftScore = j > 0 ? (dp[idx(i, j - 1)] ?? 0) : -1
      const upScore = i > 0 ? (dp[idx(i - 1, j)] ?? 0) : -1

      if (j > 0 && (i === 0 || leftScore >= upScore) && bj !== undefined) {
        result.unshift({ type: "add", line: bj })
        j--
      } else if (i > 0 && ai !== undefined) {
        result.unshift({ type: "remove", line: ai })
        i--
      } else {
        // Unreachable given loop invariants, but satisfies exhaustiveness
        break
      }
    }
  }

  return result
}

/**
 * Renders a diff with 3 lines of context, collapsing unchanged hunks.
 *
 * @param diff - Array of diff entries from `computeDiff`
 * @param fileNameA - Filename for the "before" header
 * @param fileNameB - Filename for the "after" header
 * @returns Formatted diff string ready for terminal output
 */
function renderDiff(diff: DiffEntry[], fileNameA: string, fileNameB: string): string {
  const CONTEXT = 3
  const lines: string[] = []
  const changed: boolean[] = diff.map(d => d.type !== "same")

  // Find indices of changed lines
  const visibleLines = new Set<number>()
  for (let k = 0; k < diff.length; k++) {
    if (changed[k]) {
      for (let c = Math.max(0, k - CONTEXT); c <= Math.min(diff.length - 1, k + CONTEXT); c++) {
        visibleLines.add(c)
      }
    }
  }

  if (visibleLines.size === 0) {
    return chalk.dim("  (files are identical)")
  }

  lines.push(chalk.bold(`--- ${fileNameA}`))
  lines.push(chalk.bold(`+++ ${fileNameB}`))

  let prevVisible = -1

  for (const k of [...visibleLines].sort((a, b) => a - b)) {
    if (prevVisible !== -1 && k > prevVisible + 1) {
      lines.push(chalk.dim("  ···"))
    }
    prevVisible = k

    const entry = diff[k]
    if (!entry) continue
    if (entry.type === "remove") {
      lines.push(chalk.red(`- ${entry.line}`))
    } else if (entry.type === "add") {
      lines.push(chalk.green(`+ ${entry.line}`))
    } else {
      lines.push(chalk.dim(`  ${entry.line}`))
    }
  }

  return lines.join("\n")
}

/**
 * Reads file content from a stash directory, returning lines array.
 * Returns null if file doesn't exist or cannot be read as text.
 *
 * @param stashDir - Absolute path to the stash directory
 * @param fileName - Basename of the file to read
 * @returns Array of lines, or null if binary/unreadable
 */
async function readStashFileLines(stashDir: string, fileName: string): Promise<string[] | null> {
  const filePath = join(stashDir, fileName)
  if (!(await exists(filePath))) return null
  try {
    const content = await readFile(filePath, "utf-8")
    return content.split("\n")
  } catch {
    return null // Binary or unreadable
  }
}

/**
 * Reads file content from the current working directory.
 *
 * @param fileName - Basename of the file to read from cwd
 * @returns Array of lines, or null if binary/missing/unreadable
 */
async function readCwdFileLines(fileName: string): Promise<string[] | null> {
  const filePath = join(process.cwd(), fileName)
  if (!(await exists(filePath))) return null
  try {
    const content = await readFile(filePath, "utf-8")
    return content.split("\n")
  } catch {
    return null
  }
}

/**
 * Shows the diff between two stashes or stash vs cwd.
 *
 * @param stashA - Metadata of the "before" stash
 * @param stashB - Metadata of the "after" stash (null = cwd)
 * @param repoPath - Absolute path to the stash repository
 * @param project - Project name
 * @param options - Command options
 */
async function showDiff(
  stashA: StashMetadata,
  stashB: StashMetadata | null,
  repoPath: string,
  project: string,
  options: DiffCommandOptions,
): Promise<void> {
  const stashDirA = join(repoPath, project, stashA.id)
  const stashDirB = stashB ? join(repoPath, project, stashB.id) : null

  const fileNamesA = new Set(stashA.files.map(f => f.name))
  const fileNamesB = stashB ? new Set(stashB.files.map(f => f.name)) : null

  // All unique file names across both sources
  const allFileNames = new Set(fileNamesA)
  if (fileNamesB) {
    for (const name of fileNamesB) allFileNames.add(name)
  } else {
    // vs cwd: include files from cwd that match stash files
    for (const name of fileNamesA) allFileNames.add(name)
  }

  // Apply --files filter
  let filesToDiff = [...allFileNames]
  if (options.files) {
    const { default: micromatch } = await import("micromatch")
    filesToDiff = micromatch(filesToDiff, options.files)
  }

  if (filesToDiff.length === 0) {
    console.log(chalk.dim("  No files match the filter.\n"))
    return
  }

  // Header
  const labelA = `stash:${stashA.id.slice(-8)} (${stashA.message})`
  const labelB = stashB ? `stash:${stashB.id.slice(-8)} (${stashB.message})` : "cwd"

  console.log()
  console.log(chalk.bold.cyan(`  Comparing:`))
  console.log(chalk.dim(`    A: `) + chalk.white(labelA))
  console.log(chalk.dim(`    B: `) + chalk.white(labelB))
  console.log()

  let changedCount = 0
  let addedCount = 0
  let removedCount = 0

  for (const fileName of filesToDiff) {
    const inA = fileNamesA.has(fileName)
    const inB = fileNamesB ? fileNamesB.has(fileName) : !!(await readCwdFileLines(fileName))

    if (inA && !inB) {
      // File removed in B
      console.log(chalk.bold(`  ${chalk.red("─")} ${fileName}`) + chalk.dim(" (removed)"))
      removedCount++
      continue
    }

    if (!inA && inB) {
      // File added in B
      console.log(chalk.bold(`  ${chalk.green("+")} ${fileName}`) + chalk.dim(" (added)"))
      addedCount++
      continue
    }

    // File in both: compute diff
    const linesA = await readStashFileLines(stashDirA, fileName)
    const linesB = stashDirB
      ? await readStashFileLines(stashDirB, fileName)
      : await readCwdFileLines(fileName)

    if (!linesA || !linesB) {
      console.log(
        chalk.bold(`  ${chalk.yellow("?")} ${fileName}`) + chalk.dim(" (binary or unreadable)"),
      )
      continue
    }

    // Skip if too large
    if (linesA.length > MAX_DIFF_LINES || linesB.length > MAX_DIFF_LINES) {
      const changed = linesA.join("\n") !== linesB.join("\n")
      const indicator = changed ? chalk.yellow("~") : chalk.dim("=")
      console.log(
        chalk.bold(`  ${indicator} ${fileName}`) +
          chalk.dim(` (${linesA.length} → ${linesB.length} lines, too large for inline diff)`),
      )
      if (changed) changedCount++
      continue
    }

    const sameContent = linesA.join("\n") === linesB.join("\n")

    if (sameContent) {
      if (!options.stat) {
        console.log(chalk.bold(`  ${chalk.dim("=")} ${fileName}`) + chalk.dim(" (identical)"))
      }
      continue
    }

    changedCount++
    console.log(chalk.bold(`  ${chalk.yellow("~")} ${fileName}`))

    if (!options.stat) {
      const diff = computeDiff(linesA, linesB)
      const rendered = renderDiff(diff, `A/${fileName}`, `B/${fileName}`)
      // Indent each line
      console.log(
        rendered
          .split("\n")
          .map(l => "    " + l)
          .join("\n"),
      )
      console.log()
    }
  }

  // Summary
  console.log()
  const parts: string[] = []
  if (changedCount > 0) parts.push(chalk.yellow(`${changedCount} changed`))
  if (addedCount > 0) parts.push(chalk.green(`${addedCount} added`))
  if (removedCount > 0) parts.push(chalk.red(`${removedCount} removed`))

  if (parts.length === 0) {
    console.log(chalk.dim("  All files are identical.\n"))
  } else {
    console.log("  " + parts.join(chalk.dim(", ")))
    console.log()
  }
}

/**
 * Executes the `pstash diff` command.
 *
 * @param indexA - Index of the first stash (0-based, newest first). If undefined, interactive selector.
 * @param indexB - Index of the second stash. If undefined, compares stashA against cwd.
 * @param options - Command options
 *
 * @throws {Error} If config is not initialized
 * @throws {Error} If a stash index is out of range
 */
export async function diffCommand(
  indexA: number | undefined,
  indexB: number | undefined,
  options: DiffCommandOptions,
): Promise<void> {
  const config = await loadConfig()
  const repoPath = resolveLocalPath(config.localPath)

  // Auto-pull before diffing (ensures we have latest stashes from other machines)
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

  let stashA: StashMetadata
  let stashB: StashMetadata | null = null

  if (indexA === undefined) {
    // Interactive: select stash A, then choose cwd or another stash as target.
    const resultA = await selectStash(stashes, "Select stash A (before):")
    stashA = resultA.stash

    if (stashes.length > 1) {
      const otherStashes = stashes.filter(s => s.id !== stashA.id)
      stashB = await selectDiffTarget(otherStashes)
    }
    // With only 1 stash available, stashB stays null → compare against cwd.
  } else {
    // Select by index
    const sa = stashes[indexA]
    if (!sa) {
      throw new Error(
        `Stash index ${indexA} out of range (${project} has ${stashes.length} stash${stashes.length !== 1 ? "es" : ""})`,
      )
    }
    stashA = sa

    if (indexB !== undefined) {
      const sb = stashes[indexB]
      if (!sb) {
        throw new Error(
          `Stash index ${indexB} out of range (${project} has ${stashes.length} stash${stashes.length !== 1 ? "es" : ""})`,
        )
      }
      stashB = sb
    }
  }

  await showDiff(stashA, stashB, repoPath, project, options)
}
