/**
 * src/utils/prompts.ts
 *
 * Interactive CLI prompts using @inquirer/prompts.
 */

import { select, confirm, input, checkbox } from "@inquirer/prompts"
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
 * Prompts for a text input.
 */
export async function promptInput(message: string, defaultValue?: string): Promise<string> {
  return input({ message, default: defaultValue })
}
