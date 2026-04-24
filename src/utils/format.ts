/**
 * src/utils/format.ts
 *
 * Terminal output formatters for stash display.
 */

import prettyBytes from "pretty-bytes"
import type { StashMetadata } from "../schemas.js"
import { formatTimestamp } from "./time.js"

/**
 * Formats a stash entry as a single display line.
 *
 * Output: "[0] 2026-03-12 01:05 - planning docs (6 files, 245KB) [docs, planning]"
 */
export function formatStashLine(stash: StashMetadata, index: number): string {
  const date = formatTimestamp(stash.timestamp)
  const fileCount = stash.files.length
  const size = formatSize(stash.totalSize)
  const tags = stash.tags.length > 0 ? ` [${stash.tags.join(", ")}]` : ""
  return `[${index}] ${date} - ${stash.message} (${fileCount} file${fileCount !== 1 ? "s" : ""}, ${size})${tags}`
}

/**
 * Formats bytes to a human-readable string using pretty-bytes.
 * e.g. 245000 → "245 KB"
 */
export function formatSize(bytes: number): string {
  return prettyBytes(bytes)
}

/**
 * Formats a stash for interactive prompt selection.
 * Compact format for @inquirer/prompts list.
 */
export function formatStashChoice(stash: StashMetadata, index: number): string {
  const date = formatTimestamp(stash.timestamp)
  const size = formatSize(stash.totalSize)
  const tags = stash.tags.length > 0 ? ` [${stash.tags.join(", ")}]` : ""
  return `[${index}] ${date} - ${stash.message} (${stash.files.length} files, ${size})${tags}`
}

/**
 * Formats the stash metadata block for `pstash show`.
 */
export function formatStashDetails(stash: StashMetadata, project: string): string {
  const lines: string[] = [`Stash: ${project}/${stash.id}`, `Message: ${stash.message}`]

  if (stash.tags.length > 0) {
    lines.push(`Tags: ${stash.tags.join(", ")}`)
  }

  lines.push(`Date: ${formatTimestamp(stash.timestamp)}`)

  if (stash.branch) lines.push(`Branch: ${stash.branch}`)
  if (stash.commit) lines.push(`Commit: ${stash.commit.slice(0, 7)}`)
  if (stash.user) lines.push(`User: ${stash.user}`)

  lines.push(`Files: ${stash.files.length} (${formatSize(stash.totalSize)})`)

  lines.push("\nFiles:")
  for (const file of stash.files) {
    lines.push(`  ${file.name} (${formatSize(file.size)})`)
  }

  return lines.join("\n")
}

/**
 * Truncates text to a max length, appending "..." if needed.
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength - 3) + "..."
}
