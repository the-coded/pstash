/**
 * src/utils/prompts.ts
 *
 * Interactive CLI prompts using @inquirer/prompts.
 */

import { select, confirm, input, checkbox } from "@inquirer/prompts"
import { simpleGit } from "simple-git"
import type { StashMetadata } from "../schemas.js"
import { formatStashChoice } from "./format.js"

/**
 * Shows an interactive stash selector.
 * Returns the selected stash and its index.
 */
export async function selectStash(
  stashes: StashMetadata[],
  message = "Select a stash:",
): Promise<{ stash: StashMetadata; index: number }> {
  if (stashes.length === 0) {
    throw new Error("No stashes available.")
  }

  const choices = stashes.map((stash, index) => ({
    name: formatStashChoice(stash, index),
    value: index,
  }))

  const selectedIndex = await select({
    message,
    choices,
  })

  const stash = stashes[selectedIndex]
  if (!stash) throw new Error("Invalid selection.")

  return { stash, index: selectedIndex }
}

/**
 * Shows an interactive multi-select stash picker.
 * Requires at least one selection. Returns the selected stashes in input order.
 */
export async function selectStashes(
  stashes: StashMetadata[],
  message = "Select stashes (space to toggle, enter to confirm):",
): Promise<StashMetadata[]> {
  if (stashes.length === 0) {
    throw new Error("No stashes available.")
  }

  const choices = stashes.map((stash, index) => ({
    name: formatStashChoice(stash, index),
    value: index,
  }))

  const selectedIndices = await checkbox({
    message,
    choices,
    required: true,
  })

  const result: StashMetadata[] = []
  for (const i of selectedIndices) {
    const s = stashes[i]
    if (!s) throw new Error(`Invalid selection: index ${i} out of range`)
    result.push(s)
  }
  return result
}

/**
 * Shows a yes/no confirmation prompt.
 */
export async function confirmAction(message: string): Promise<boolean> {
  return confirm({ message, default: false })
}

/**
 * Sentinel value for "compare against current working directory" in diff prompts.
 */
export const DIFF_TARGET_CWD = "__pstash_diff_cwd__"

/**
 * Shows a select prompt asking what to compare a stash against:
 * either the current working directory (cwd) or another stash.
 *
 * @param otherStashes - Candidate stashes to compare against (already excluding stash A)
 * @returns The selected stash, or `null` if the user picked "cwd"
 */
export async function selectDiffTarget(
  otherStashes: StashMetadata[],
): Promise<StashMetadata | null> {
  const choices = [
    { name: "Current working directory (cwd)", value: DIFF_TARGET_CWD },
    ...otherStashes.map((stash, index) => ({
      name: formatStashChoice(stash, index),
      value: stash.id,
    })),
  ]

  const choice = await select({
    message: "Compare against:",
    choices,
  })

  if (choice === DIFF_TARGET_CWD) return null
  const selected = otherStashes.find(s => s.id === choice)
  if (!selected) throw new Error("Invalid diff target selection.")
  return selected
}

/**
 * Prompts for a text input.
 */
export async function promptInput(message: string, defaultValue?: string): Promise<string> {
  return input({ message, default: defaultValue })
}

/**
 * Sentinel value for the "add custom glob" checkbox entry.
 */
const CUSTOM_GLOB_SENTINEL = "__pstash_add_custom_glob__"

/**
 * Lists the current git repo's unstaged + untracked files, if any.
 * Returns an empty array when the cwd is not a git repo.
 */
async function listUnstagedFiles(cwd: string): Promise<{ path: string; status: string }[]> {
  try {
    const git = simpleGit(cwd)
    const status = await git.status()
    const files: { path: string; status: string }[] = []
    for (const f of status.modified) files.push({ path: f, status: "modified" })
    for (const f of status.not_added) files.push({ path: f, status: "untracked" })
    return files
  } catch {
    return []
  }
}

/**
 * Interactively prompts the user for file patterns to stash.
 *
 * Flow:
 * 1. Lists unstaged + untracked files from git (if in a repo).
 * 2. Shows a checkbox picker with those files + a special
 *    "➕ Add custom glob pattern..." entry.
 * 3. If the user selects the "add custom glob" entry (or no git files
 *    are available), prompts for a glob pattern string. Multiple
 *    space-separated patterns are accepted.
 * 4. Returns the combined list (selected files + parsed glob patterns).
 *
 * Throws if the user provides no files and no glob pattern.
 *
 * @param cwd - Working directory to inspect for git status (default: process.cwd())
 */
export async function promptFilePatterns(cwd: string = process.cwd()): Promise<string[]> {
  const gitFiles = await listUnstagedFiles(cwd)

  let selectedFiles: string[] = []
  let wantsCustomGlob: boolean

  if (gitFiles.length > 0) {
    const choices = [
      ...gitFiles.map(f => ({
        name: `${f.path}  (${f.status})`,
        value: f.path,
      })),
      { name: "➕ Add custom glob pattern...", value: CUSTOM_GLOB_SENTINEL },
    ]
    const picked = await checkbox({
      message: "Files to stash (space to toggle, enter to confirm):",
      choices,
      // Not required: user may opt to only provide a custom glob below.
    })
    wantsCustomGlob = picked.includes(CUSTOM_GLOB_SENTINEL)
    selectedFiles = picked.filter(p => p !== CUSTOM_GLOB_SENTINEL)
  } else {
    // No git repo or nothing unstaged/untracked — go straight to glob input.
    wantsCustomGlob = true
  }

  const patterns: string[] = [...selectedFiles]

  if (wantsCustomGlob) {
    const raw = await input({
      message: "Glob pattern(s) (space-separated):",
    })
    const globs = raw.trim().split(/\s+/).filter(Boolean)
    patterns.push(...globs)
  }

  if (patterns.length === 0) {
    throw new Error("You must select at least one file or provide a glob pattern.")
  }

  return patterns
}
