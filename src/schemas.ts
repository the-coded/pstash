/**
 * src/schemas.ts
 *
 * Zod as Single Source of Truth (SSoT) for all types.
 * No manual `interface` or `type` — everything derived via `z.infer<>`.
 */

import { z } from "zod"

// ─── File-level Schema ─────────────────────────────────────────────────────

export const StashFileSchema = z.object({
  name: z.string(),
  size: z.number().nonnegative(),
  hash: z.string(), // SHA-256 via node:crypto, format: "sha256:<hex>"
})

export type StashFile = z.infer<typeof StashFileSchema>

// ─── Stash Metadata Schema (.stash.json) ───────────────────────────────────

export const StashMetadataSchema = z.object({
  id: z.string(), // Format: "YYYY-MM-DD_HH-mm_XXXX"
  project: z.string(),
  timestamp: z.string().datetime(),
  message: z.string(),
  tags: z.array(z.string()).default([]),
  branch: z.string().optional(),
  commit: z.string().optional(),
  user: z.string().optional(), // "username@hostname"
  files: z.array(StashFileSchema),
  totalSize: z.number().nonnegative(),
  compressed: z.boolean().default(false),
})

export type StashMetadata = z.infer<typeof StashMetadataSchema>

// ─── Project Metadata Schema (.project.json) ───────────────────────────────

export const ProjectMetadataSchema = z.object({
  name: z.string(),
  remote: z.string().optional(),
  aliases: z.array(z.string()).default([]),
  stashCount: z.number().nonnegative(),
  totalSize: z.string(), // Human-readable, e.g. "268KB"
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
})

export type ProjectMetadata = z.infer<typeof ProjectMetadataSchema>

// ─── Project Config Entry (inside GlobalConfig) ────────────────────────────

export const ProjectConfigSchema = z.object({
  aliases: z.array(z.string()).default([]),
  remote: z.string().optional(),
  path: z.string().optional(),
})

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>

// ─── Global Config Schema (~/.pstashrc) ────────────────────────────────────

export const GlobalConfigSchema = z.object({
  version: z.string(),
  remote: z.string().url(),
  localPath: z.string().default("~/.pstash"), // Expanded to os.homedir() + "/.pstash" by loader
  autoSync: z.boolean().default(true),
  projects: z.record(z.string(), ProjectConfigSchema).default({}),
  defaults: z.object({
    keepOnPop: z.boolean().default(false),
    autoPush: z.boolean().default(true),
    compression: z.boolean().default(true),
    removeAfterSave: z.boolean().default(false),
  }),
})

export type GlobalConfig = z.infer<typeof GlobalConfigSchema>

// ─── CLI Options Schemas ────────────────────────────────────────────────────

export const SaveOptionsSchema = z.object({
  message: z.string().min(1, "Message is required"),
  files: z.array(z.string()).min(1, "At least one file pattern required"),
  tags: z.array(z.string()).default([]),
  project: z.string().optional(),
  push: z.boolean().default(true),
  compress: z.boolean().default(true),
  removeAfterSave: z.boolean().optional(), // undefined = use config default
})

export type SaveOptions = z.infer<typeof SaveOptionsSchema>

export const ListOptionsSchema = z.object({
  all: z.boolean().default(false),
  project: z.string().optional(),
  tag: z.string().optional(),
  since: z.string().optional(), // e.g. "7d", "2w", "2026-03-01"
  until: z.string().optional(),
  preview: z.boolean().default(false),
  json: z.boolean().default(false),
})

export type ListOptions = z.infer<typeof ListOptionsSchema>

export const RestoreOptionsSchema = z.object({
  stashIndex: z.number().int().nonnegative().optional(),
  files: z.string().optional(), // Glob pattern for partial restore (Phase 3)
  dest: z.string().optional(), // Destination directory (default: cwd)
  keep: z.boolean().default(false), // Keep stash after restore
  force: z.boolean().default(false), // Overwrite existing files
})

export type RestoreOptions = z.infer<typeof RestoreOptionsSchema>

export const InitOptionsSchema = z.object({
  remote: z.string().url().optional(),
  path: z.string().optional(),
})

export type InitOptions = z.infer<typeof InitOptionsSchema>

export const SyncOptionsSchema = z.object({
  pull: z.boolean().default(false),
  push: z.boolean().default(false),
})

export type SyncOptions = z.infer<typeof SyncOptionsSchema>

export const StatusOptionsSchema = z.object({
  all: z.boolean().default(false),
  json: z.boolean().default(false),
})

export type StatusOptions = z.infer<typeof StatusOptionsSchema>

export const DropOptionsSchema = z.object({
  stashIndex: z.number().int().nonnegative().optional(),
  project: z.string().optional(),
  tag: z.string().optional(),
  all: z.boolean().default(false),
  force: z.boolean().default(false),
})

export type DropOptions = z.infer<typeof DropOptionsSchema>

export const CleanOptionsSchema = z.object({
  olderThan: z.string().optional(), // e.g. "30d", "2w", "1m"
  keep: z.number().int().positive().optional(), // Keep N most recent
  tag: z.string().optional(),
  dryRun: z.boolean().default(false),
})

export type CleanOptions = z.infer<typeof CleanOptionsSchema>
