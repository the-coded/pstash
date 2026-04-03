/**
 * src/config/loader.ts
 *
 * Load and save ~/.pstashrc global config.
 * Uses os.homedir() for cross-platform path resolution.
 */

import { readFile, writeFile, access } from "node:fs/promises"
import { join, resolve } from "node:path"
import { homedir } from "node:os"
import { GlobalConfigSchema } from "../schemas.js"
import type { GlobalConfig } from "../schemas.js"

/** Absolute path to the global config file */
export const CONFIG_PATH = join(homedir(), ".pstashrc")

/**
 * Resolves the stash repo local path from config.
 * Handles "~/.pstash" notation → expands to absolute path.
 */
export function resolveLocalPath(localPath: string): string {
  if (localPath.startsWith("~/")) {
    return join(homedir(), localPath.slice(2))
  }
  if (localPath.startsWith("~")) {
    return join(homedir(), localPath.slice(1))
  }
  return resolve(localPath)
}

/**
 * Checks whether the config file exists.
 */
export async function configExists(): Promise<boolean> {
  try {
    await access(CONFIG_PATH)
    return true
  } catch {
    return false
  }
}

/**
 * Loads and validates ~/.pstashrc.
 * Throws if file not found or invalid.
 */
export async function loadConfig(): Promise<GlobalConfig> {
  let raw: string
  try {
    raw = await readFile(CONFIG_PATH, "utf-8")
  } catch {
    throw new Error(
      `Config file not found: ${CONFIG_PATH}\n` +
        `Run "pstash init" to set up your personal stash.`,
    )
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    throw new Error(`Config file is not valid JSON: ${CONFIG_PATH}`)
  }

  const result = GlobalConfigSchema.safeParse(parsed)
  if (!result.success) {
    const issues = result.error.issues.map(i => `  - ${i.path.join(".")}: ${i.message}`).join("\n")
    throw new Error(`Config validation failed:\n${issues}`)
  }

  return result.data
}

/**
 * Saves config to ~/.pstashrc.
 */
export async function saveConfig(config: GlobalConfig): Promise<void> {
  const validated = GlobalConfigSchema.parse(config)
  await writeFile(CONFIG_PATH, JSON.stringify(validated, null, 2) + "\n", "utf-8")
}

/**
 * Updates a specific key in the config.
 */
export async function updateConfig(updates: Partial<GlobalConfig>): Promise<GlobalConfig> {
  const current = await loadConfig()
  const merged = { ...current, ...updates }
  const validated = GlobalConfigSchema.parse(merged)
  await saveConfig(validated)
  return validated
}
