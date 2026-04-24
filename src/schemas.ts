/**
 * @module schemas
 *
 * Zod as Single Source of Truth (SSoT) for all types.
 *
 * **Rule**: No manual `interface` or `type` declarations anywhere in the codebase.
 * All types are derived via `z.infer<typeof Schema>`.
 *
 * Validation happens at every I/O boundary:
 * - Reading `.stash.json` and `.project.json` files
 * - Reading `~/.pstashrc` config
 * - Parsing CLI options
 *
 * @example
 * // Parse and validate untrusted data
 * const metadata = StashMetadataSchema.parse(JSON.parse(rawJson))
 *
 * // Get TypeScript type from schema
 * type Metadata = z.infer<typeof StashMetadataSchema>
 */

import { z } from "zod"

// ─── File-level Schema ─────────────────────────────────────────────────────

/**
 * Represents a single file entry within a stash.
 *
 * @example
 * const file: StashFile = {
 *   name: "README.md",
 *   size: 1024,
 *   hash: "sha256:a1b2c3d4e5f6"
 * }
 */
export const StashFileSchema = z.object({
  /** Original filename (basename only, no path) */
  name: z.string(),
  /** File size in bytes */
  size: z.number().nonnegative(),
  /**
   * SHA-256 integrity hash, prefixed with "sha256:".
   * First 12 hex chars used (48 bits) — sufficient for integrity checking.
   * @example "sha256:a1b2c3d4e5f6"
   */
  hash: z.string(),
})

export type StashFile = z.infer<typeof StashFileSchema>

// ─── Stash Metadata Schema (.stash.json) ───────────────────────────────────

/**
 * Metadata stored in `.stash.json` inside each stash directory.
 * Created by `Stasher.save()`, read by `Stasher.loadMetadata()`.
 *
 * @example
 * // Stash directory structure:
 * // my-personal-stash/scena/2026-03-12_01-05_k7x2/.stash.json
 */
export const StashMetadataSchema = z.object({
  /**
   * Unique stash identifier.
   * Format: `YYYY-MM-DD_HH-mm_XXXX` (timestamp + 4-char nanoid suffix).
   * The suffix prevents collisions when multiple machines stash in the same minute.
   * @example "2026-03-12_01-05_k7x2"
   */
  id: z.string(),
  /** Project name (derived from git remote or directory name) */
  project: z.string(),
  /** ISO 8601 creation timestamp */
  timestamp: z.string().datetime(),
  /**
   * ISO 8601 timestamp of the last `pstash update` on this stash.
   * Absent when the stash has never been updated.
   */
  updatedAt: z.string().datetime().optional(),
  /** Human-readable description of what was stashed */
  message: z.string(),
  /**
   * User-defined tags for filtering and organization.
   * @example ["docs", "planning", "wip"]
   */
  tags: z.array(z.string()).default([]),
  /** Git branch at time of stash (if inside a git repo) */
  branch: z.string().optional(),
  /** Git commit hash at time of stash (if inside a git repo) */
  commit: z.string().optional(),
  /**
   * Machine identifier of who created the stash.
   * Format: `username@hostname` using `os.userInfo().username` (cross-platform).
   * @example "gab@macmini"
   */
  user: z.string().optional(),
  /** List of stashed files with size and integrity hash */
  files: z.array(StashFileSchema),
  /** Total size of all files in bytes */
  totalSize: z.number().nonnegative(),
  /** Whether files are stored as tar.gz (Phase 3 feature) */
  compressed: z.boolean().default(false),
})

export type StashMetadata = z.infer<typeof StashMetadataSchema>

// ─── Project Metadata Schema (.project.json) ───────────────────────────────

/**
 * Metadata stored in `.project.json` at the project directory root.
 * Managed by `Indexer` — updated after every save/delete.
 *
 * @example
 * // my-personal-stash/scena/.project.json
 * {
 *   "name": "scena",
 *   "stashCount": 3,
 *   "totalSize": "268 KB"
 * }
 */
export const ProjectMetadataSchema = z.object({
  /** Project name (matches directory name in stash repo) */
  name: z.string(),
  /** Git remote URL for this project (informational only) */
  remote: z.string().optional(),
  /**
   * Alternative names that map to this project.
   * @example ["scena-cli", "e2e-gen"] → resolves to "scena"
   */
  aliases: z.array(z.string()).default([]),
  /** Total number of stash entries for this project */
  stashCount: z.number().nonnegative(),
  /**
   * Human-readable total size of all stashes.
   * Formatted via `pretty-bytes`.
   * @example "268 KB"
   */
  totalSize: z.string(),
  /** ISO 8601 timestamp of first stash creation */
  createdAt: z.string().datetime(),
  /** ISO 8601 timestamp of last stash modification */
  updatedAt: z.string().datetime(),
})

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>

// ─── Project Config Entry (inside GlobalConfig) ────────────────────────────

/**
 * Per-project configuration inside `~/.pstashrc`.
 * All fields are optional — only needed to customize behavior.
 */
export const ProjectConfigSchema = z.object({
  /**
   * Alternative names that resolve to this project.
   * @example ["e2e-gen", "scena-cli"] both map to "scena"
   */
  aliases: z.array(z.string()).default([]),
  /**
   * Override the detected git remote for this project.
   * Useful if the project name differs from the remote.
   */
  remote: z.string().optional(),
  /** Absolute path to the project directory */
  path: z.string().optional(),
})

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>

// ─── Global Config Schema (~/.pstashrc) ────────────────────────────────────

/**
 * Global configuration stored at `~/.pstashrc`.
 *
 * - Location: `os.homedir() + "/.pstashrc"` (cross-platform)
 * - Never stored inside the data repo (`my-personal-stash`)
 * - Loaded and validated by `src/config/loader.ts`
 *
 * @example
 * {
 *   "version": "1.0.0",
 *   "remote": "git@github.com:user/my-personal-stash.git",
 *   "localPath": "~/.pstash",
 *   "autoSync": true,
 *   "projects": {},
 *   "defaults": { "removeAfterSave": false }
 * }
 */
export const GlobalConfigSchema = z.object({
  /** Config schema version for future migrations */
  version: z.string(),
  /** SSH or HTTPS URL of the personal stash data repository (SSH or HTTPS) */
  remote: z.string().min(1, "Remote URL is required"),
  /**
   * Local path for the cloned stash data repo.
   * Supports `~` expansion: `"~/.pstash"` → `"/Users/gab/.pstash"`.
   * Resolved by `resolveLocalPath()` in `config/loader.ts`.
   */
  localPath: z.string().default("~/.pstash"),
  /**
   * Whether to automatically pull before and push after write operations
   * (save, pop, drop, clean) and pull before read operations (list).
   * Can be overridden per-operation with `--no-sync`.
   */
  autoSync: z.boolean().default(true),
  /**
   * Per-project overrides (aliases, custom remote, path).
   * Key is the canonical project name.
   */
  projects: z.record(z.string(), ProjectConfigSchema).default({}),
  /** Default behavior settings (can be overridden per-command) */
  defaults: z.object({
    /** If true, `pstash pop` keeps the stash after restoring (like apply) */
    keepOnPop: z.boolean().default(false),
    /** If true, compress stash files as tar.gz (Phase 3) */
    compression: z.boolean().default(false),
    /**
     * If true, delete source files after `pstash save`.
     * Can be overridden per-operation: `--rm` to force delete, `--keep` to force keep.
     */
    removeAfterSave: z.boolean().default(false),
  }),
})

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>

// ─── CLI Options Schemas ────────────────────────────────────────────────────

/**
 * Options for the `pstash save` command.
 *
 * @example
 * pstash save -t docs -t wip "planning notes" *.md
 */
export const SaveOptionsSchema = z.object({
  /** Required description of what was stashed */
  message: z.string().min(1, "Message is required"),
  /**
   * File patterns to stash (glob patterns supported via globby).
   * @example ["*.md", "src/**\/*.ts"]
   */
  files: z.array(z.string()).min(1, "At least one file pattern required"),
  /** Tags for filtering and organization */
  tags: z.array(z.string()).default([]),
  /** Override auto-detected project name */
  project: z.string().optional(),
  /** Whether to push to remote after saving */
  push: z.boolean().default(true),
  /** Whether to compress the stash (Phase 3) */
  compress: z.boolean().default(false),
  /**
   * Whether to remove source files after saving.
   * `undefined` = use `config.defaults.removeAfterSave`.
   * `true` (--rm) = always remove.
   * `false` (--keep) = always keep.
   */
  removeAfterSave: z.boolean().optional(),
})

export type SaveOptions = z.infer<typeof SaveOptionsSchema>

/**
 * Options for the `pstash list` command.
 */
export const ListOptionsSchema = z.object({
  /** Show stashes from all projects (not just current) */
  all: z.boolean().default(false),
  /** Filter by specific project name */
  project: z.string().optional(),
  /** Filter by tag */
  tag: z.string().optional(),
  /**
   * Show stashes created after this timespec.
   * @example "7d" (7 days ago), "2w", "1m", "2026-03-01"
   */
  since: z.string().optional(),
  /** Show stashes created before this timespec */
  until: z.string().optional(),
  /** Show preview of first 3 lines of each file */
  preview: z.boolean().default(false),
  /** Output as JSON for scripting */
  json: z.boolean().default(false),
})

export type ListOptions = z.infer<typeof ListOptionsSchema>

/**
 * Options for `pstash pop` and `pstash apply` commands.
 */
export const RestoreOptionsSchema = z.object({
  /**
   * Index of the stash to restore (0-based, newest first).
   * If undefined, shows interactive selector.
   */
  stashIndex: z.number().int().nonnegative().optional(),
  /**
   * Glob pattern for partial restore (Phase 3, requires micromatch).
   * @example "*.md" to restore only markdown files
   */
  files: z.string().optional(),
  /**
   * Destination directory for restored files.
   * Defaults to `process.cwd()`.
   */
  dest: z.string().optional(),
  /** If true, keep the stash after restoring (apply behavior) */
  keep: z.boolean().default(false),
  /** If true, overwrite existing files without error */
  force: z.boolean().default(false),
})

export type RestoreOptions = z.infer<typeof RestoreOptionsSchema>

/**
 * Options for `pstash init` command.
 */
export const InitOptionsSchema = z.object({
  /** SSH or HTTPS URL for the data repo (SSH or HTTPS) */
  remote: z.string().min(1).optional(),
  /** Local path to clone to (default: ~/.pstash) */
  path: z.string().optional(),
})

export type InitOptions = z.infer<typeof InitOptionsSchema>

/**
 * Options for `pstash sync` command.
 */
export const SyncOptionsSchema = z.object({
  /** Pull only (skip push) */
  pull: z.boolean().default(false),
  /** Push only (skip pull) */
  push: z.boolean().default(false),
})

export type SyncOptions = z.infer<typeof SyncOptionsSchema>

/**
 * Options for `pstash status` command.
 */
export const StatusOptionsSchema = z.object({
  /** Show status for all projects */
  all: z.boolean().default(false),
  /** Output as JSON for scripting */
  json: z.boolean().default(false),
})

export type StatusOptions = z.infer<typeof StatusOptionsSchema>

/**
 * Options for `pstash drop` command.
 */
export const DropOptionsSchema = z.object({
  /** Index of the stash to drop (0-based). If undefined, shows interactive selector. */
  stashIndex: z.number().int().nonnegative().optional(),
  /** Limit to a specific project */
  project: z.string().optional(),
  /** Drop all stashes with this tag */
  tag: z.string().optional(),
  /** Drop all stashes in the project (requires confirmation) */
  all: z.boolean().default(false),
  /** Skip confirmation prompt */
  force: z.boolean().default(false),
})

export type DropOptions = z.infer<typeof DropOptionsSchema>

/**
 * Options for `pstash clean` command (Phase 3).
 */
export const CleanOptionsSchema = z.object({
  /**
   * Delete stashes older than this timespec.
   * @example "30d", "2w", "1m"
   */
  olderThan: z.string().optional(),
  /** Keep only N most recent stashes per project */
  keep: z.number().int().positive().optional(),
  /** Delete only stashes with this tag */
  tag: z.string().optional(),
  /** Preview what would be deleted without actually deleting */
  dryRun: z.boolean().default(false),
})

export type CleanOptions = z.infer<typeof CleanOptionsSchema>
