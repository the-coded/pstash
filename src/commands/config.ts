/**
 * @module commands/config
 *
 * `pstash config` — View and modify ~/.pstashrc configuration values.
 *
 * Inspired by `git config` semantics:
 * - `pstash config` or `pstash config --list` — show all values
 * - `pstash config <key>` — get a specific value (dot notation for nested keys)
 * - `pstash config <key> <value>` — set a specific value
 *
 * Supported key paths (dot notation):
 * - `remote`                     — SSH/HTTPS URL of the stash data repo
 * - `localPath`                  — Local clone path (e.g. ~/.pstash)
 * - `autoSync`                   — true/false
 * - `defaults.compression`       — true/false
 * - `defaults.removeAfterSave`   — true/false
 * - `defaults.keepOnPop`         — true/false
 *
 * @example
 * // List all config
 * pstash config
 *
 * // Get a specific value
 * pstash config defaults.compression
 *
 * // Set a value
 * pstash config defaults.compression true
 *
 * // Output as JSON
 * pstash config --json
 */

import chalk from "chalk"
import { loadConfig, saveConfig, CONFIG_PATH } from "../config/loader.js"
import type { GlobalConfig } from "../schemas.js"

export interface ConfigCommandOptions {
  /** List all config values (default behavior) */
  list?: boolean
  /** Output as JSON */
  json?: boolean
}

/** Map of all settable config key paths to their allowed types */
const SETTABLE_KEYS: Record<string, "string" | "boolean"> = {
  remote: "string",
  localPath: "string",
  autoSync: "boolean",
  "defaults.compression": "boolean",
  "defaults.removeAfterSave": "boolean",
  "defaults.keepOnPop": "boolean",
}

/**
 * Gets a nested config value using dot notation.
 *
 * @param config - The global config object
 * @param key - Dot-notation key path (e.g. "defaults.compression")
 * @returns The value at the key path, or undefined if not found
 *
 * @example
 * getConfigValue(config, "defaults.compression") // → false
 * getConfigValue(config, "remote")               // → "git@github.com:..."
 */
function getConfigValue(config: GlobalConfig, key: string): unknown {
  const parts = key.split(".")
  let current: unknown = config

  for (const part of parts) {
    if (current === null || typeof current !== "object") return undefined
    current = (current as Record<string, unknown>)[part]
  }

  return current
}

/**
 * Sets a nested config value using dot notation and returns the updated config.
 * Does NOT write to disk — call `saveConfig()` after this.
 *
 * @param config - The global config object to mutate a copy of
 * @param key - Dot-notation key path (e.g. "defaults.compression")
 * @param rawValue - String representation of the new value
 * @returns Updated config object (deep clone with the new value applied)
 *
 * @throws {Error} If the key is not in the settable key list
 * @throws {Error} If the value type is invalid for the key
 *
 * @example
 * const updated = setConfigValue(config, "defaults.compression", "true")
 * await saveConfig(updated)
 */
function setConfigValue(config: GlobalConfig, key: string, rawValue: string): GlobalConfig {
  const expectedType = SETTABLE_KEYS[key]
  if (!expectedType) {
    const validKeys = Object.keys(SETTABLE_KEYS).join(", ")
    throw new Error(`Unknown config key: "${key}"\n  Valid keys: ${validKeys}`)
  }

  // Parse the value to the correct type
  let parsedValue: unknown
  if (expectedType === "boolean") {
    if (rawValue === "true") parsedValue = true
    else if (rawValue === "false") parsedValue = false
    else throw new Error(`Invalid value for "${key}": must be "true" or "false"`)
  } else {
    parsedValue = rawValue
  }

  // Deep clone and apply
  const updated = JSON.parse(JSON.stringify(config)) as GlobalConfig
  const parts = key.split(".")

  let target: Record<string, unknown> = updated as unknown as Record<string, unknown>
  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i]
    if (part === undefined) continue
    target = target[part] as Record<string, unknown>
  }
  const lastPart = parts[parts.length - 1]
  if (lastPart === undefined) {
    throw new Error(`Invalid config key: ${key}`)
  }
  target[lastPart] = parsedValue

  return updated
}

/**
 * Formats the entire config for human-readable terminal display.
 *
 * @param config - The global config object
 */
function printConfigTable(config: GlobalConfig): void {
  const rows: Array<[string, string]> = [
    ["remote", config.remote],
    ["localPath", config.localPath],
    ["autoSync", String(config.autoSync)],
    ["defaults.compression", String(config.defaults.compression)],
    ["defaults.removeAfterSave", String(config.defaults.removeAfterSave)],
    ["defaults.keepOnPop", String(config.defaults.keepOnPop)],
    ["version", config.version],
  ]

  const maxKeyLen = Math.max(...rows.map(([k]) => k.length))

  console.log()
  console.log(chalk.dim(`  Config: ${CONFIG_PATH}`))
  console.log()

  for (const [key, value] of rows) {
    const padded = key.padEnd(maxKeyLen)
    const coloredValue =
      value === "true"
        ? chalk.green(value)
        : value === "false"
          ? chalk.red(value)
          : chalk.white(value)
    console.log(`  ${chalk.dim(padded)}  ${coloredValue}`)
  }

  const projectCount = Object.keys(config.projects).length
  if (projectCount > 0) {
    console.log()
    console.log(chalk.dim(`  projects (${projectCount}):`))
    for (const [name, proj] of Object.entries(config.projects)) {
      const aliasStr = proj.aliases.length > 0 ? ` [aliases: ${proj.aliases.join(", ")}]` : ""
      console.log(`    ${chalk.cyan(name)}${chalk.dim(aliasStr)}`)
    }
  }

  console.log()
}

/**
 * Executes the `pstash config` command.
 *
 * @param key - Optional key to get or set (dot notation)
 * @param value - Optional value to set (if provided, sets the key)
 * @param options - Display options
 *
 * @throws {Error} If config is not initialized
 * @throws {Error} If `key` is invalid or `value` has wrong type
 */
export async function configCommand(
  key: string | undefined,
  value: string | undefined,
  options: ConfigCommandOptions,
): Promise<void> {
  const config = await loadConfig()

  // ── SET: pstash config <key> <value> ──────────────────────────────────────
  if (key && value !== undefined) {
    const updated = setConfigValue(config, key, value)
    await saveConfig(updated)

    const newValue = getConfigValue(updated, key)
    console.log()
    console.log(`  ${chalk.dim(key)} = ${chalk.green(String(newValue))}` + chalk.dim("  (saved)"))
    console.log()
    return
  }

  // ── GET: pstash config <key> ───────────────────────────────────────────────
  if (key) {
    const val = getConfigValue(config, key)
    if (val === undefined) {
      throw new Error(`Config key not found: "${key}"`)
    }

    if (options.json) {
      console.log(JSON.stringify(val, null, 2))
      return
    }

    console.log(String(val))
    return
  }

  // ── LIST: pstash config (or --list) ───────────────────────────────────────
  if (options.json) {
    console.log(JSON.stringify(config, null, 2))
    return
  }

  printConfigTable(config)
}
